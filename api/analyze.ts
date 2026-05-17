import type { ApiReq, ApiRes, AnalyzeRequest, AIProvider } from './_lib/types.js';
import {
  FALLBACK_ORDER, PROVIDER_AVAILABLE, PROVIDER_LABELS, isQuotaError,
} from './_lib/providers.js';
import { JSONParseError } from './_lib/parse.js';
import { runStagedAnalysis } from './_lib/multiStage.js';
import { canonicalizeImageInput } from './_lib/imageCanonical.js';
import { buildQuickPrompt, buildDetailedPrompt } from './_lib/prompt.js';
import { checkRateLimit } from './_lib/rateLimit.js';
import { handlePreflight } from './_lib/cors.js';
import { validateImage } from './_lib/validate.js';
import { verifyJwt, getServiceClient, isServiceAvailable } from './_lib/auth.js';
import { applyFoodDbMatch } from './_lib/foodMatch.js';

interface QuotaResult {
  ok: boolean;
  consumed?: 'admin' | 'free' | 'cal';
  error?: string;
  cal_balance?: number;
  daily_usage_count?: number;
  daily_usage_reset_at?: string;
}

function send(res: ApiRes, payload: unknown) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export default async function handler(req: ApiReq, res: ApiRes) {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST, OPTIONS');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const rate = checkRateLimit(req);
  if (!rate.ok) {
    res.statusCode = 429;
    res.setHeader('Retry-After', String(rate.retryAfter ?? 60));
    res.end(JSON.stringify({ error: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.' }));
    return;
  }

  // Vercel은 Content-Type: application/json 인 경우 req.body 자동 파싱.
  // 로컬 vite proxy 환경 등에서 미파싱이면 수동 파싱.
  const body: AnalyzeRequest = await readBody(req);
  const {
    imageData,
    imageWidth: reqWidth,
    imageHeight: reqHeight,
    age,
    gender,
    existingMealsCount = 0,
    mode = 'detailed',
    provider = 'claude',
  } = body;

  if (!age || !gender) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'age, gender 가 필요합니다.' }));
    return;
  }

  const imageErr = validateImage(imageData);
  if (imageErr) {
    res.statusCode = imageErr.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: imageErr.error }));
    return;
  }

  let canonical;
  try {
    canonical = canonicalizeImageInput(imageData, reqWidth, reqHeight);
  } catch (e) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : '이미지 검증 실패' }));
    return;
  }

  // cal 차감 (인증된 사용자만). 인증 미흡/서비스 미가용 시는 차감 없이 통과(개발 모드/익명 호환).
  let quota: QuotaResult | null = null;
  let userId: string | null = null;
  if (isServiceAvailable()) {
    const auth = await verifyJwt(req);
    if (auth) {
      userId = auth.userId;
      const supabase = getServiceClient();
      const consume = await supabase.rpc('consume_analysis_quota', { p_user_id: auth.userId });
      if (consume.error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'quota_check_failed', detail: consume.error.message }));
        return;
      }
      quota = (consume.data ?? null) as QuotaResult | null;
      if (!quota?.ok) {
        res.statusCode = 402;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: quota?.error ?? 'insufficient_cal',
          cal_balance: quota?.cal_balance ?? 0,
          daily_usage_count: quota?.daily_usage_count ?? 0,
          daily_usage_reset_at: quota?.daily_usage_reset_at ?? null,
        }));
        return;
      }
    }
  }

  const supabaseForRefund = (isServiceAvailable() && userId && quota?.consumed === 'cal')
    ? getServiceClient() : null;
  const refundUserId = userId;
  const needsRefundOnFail = !!supabaseForRefund;
  let succeeded = false;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const prompt = mode === 'quick'
    ? buildQuickPrompt(age, gender)
    : buildDetailedPrompt(age, gender, existingMealsCount + 1);
  const base64Data = canonical.imageData.split(',')[1] || canonical.imageData;

  const ordered: AIProvider[] = [
    provider,
    ...FALLBACK_ORDER.filter(p => p !== provider),
  ].filter(p => PROVIDER_AVAILABLE[p]);

  if (ordered.length === 0) {
    send(res, { type: 'error', message: '사용 가능한 AI 프로바이더가 없습니다 (서버 키 누락).' });
    if (needsRefundOnFail && supabaseForRefund && refundUserId) {
      await supabaseForRefund.rpc('refund_analysis_quota', { p_user_id: refundUserId, p_reason: 'no_provider' });
    }
    res.end();
    return;
  }

  let lastErrMsg = '';
  for (const cur of ordered) {
    try {
      send(res, { type: 'step', index: 0, detail: `${PROVIDER_LABELS[cur]} 연결 완료` });
      // T-035: step 1을 AI 호출 직전에 사전 emit. 의미는 "음식 감지 완료"가 아니라 "AI 응답 대기 중".
      send(res, { type: 'step', index: 1, detail: `${PROVIDER_LABELS[cur]} 2단계 분석 시작` });
      const result = await runStagedAnalysis(
        cur,
        base64Data,
        prompt,
        mode,
        {
          age,
          gender,
          existingMealsCount,
          imageWidth: canonical.width,
          imageHeight: canonical.height,
        },
        detail => send(res, { type: 'step', index: 1, detail }),
      );

      const segHint = result.foodSegments?.length
        ? ` · ${result.foodSegments.length}개 음식 영역`
        : '';
      send(res, { type: 'step', index: 2, detail: `${result.calories} kcal | ${result.weightGrams}g 산출됨${segHint}` });
      send(res, { type: 'step', index: 3, detail: result.portionEstimate ? `${result.portionEstimate.referenceObject} 기준 추정` : `"${result.foodName}" 분류 완료` });
      send(res, { type: 'step', index: 4, detail: `신뢰도: ${result.confidence ?? '중간'}` });

      // T-069/T-081: DB 식품 매칭. similarity > 0.7 시 영양정보 보정, 미달이면 실패 로그 적재.
      const { result: finalResult, dbMatch } = await applyFoodDbMatch(result, {
        userId,
        provider: cur,
        mode,
        logPrefix: 'analyze',
      });

      send(res, { type: 'done', result: finalResult, quota, dbMatch });
      succeeded = true;
      res.end();
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastErrMsg = message;
      const recoverable = err instanceof JSONParseError || isQuotaError(message);
      console.error(`[analyze] ${cur} 실패 (recoverable=${recoverable}):`, message);
      if (recoverable) {
        send(res, { type: 'provider-fallback', from: cur, reason: err instanceof JSONParseError ? 'parse' : 'quota' });
        continue;
      }
      send(res, { type: 'error', message });
      if (needsRefundOnFail && !succeeded && supabaseForRefund && refundUserId) {
        await supabaseForRefund.rpc('refund_analysis_quota', { p_user_id: refundUserId, p_reason: 'analysis_failed' });
      }
      res.end();
      return;
    }
  }

  send(res, { type: 'error', message: `모든 AI 서비스 실패: ${lastErrMsg}` });
  if (needsRefundOnFail && !succeeded && supabaseForRefund && refundUserId) {
    await supabaseForRefund.rpc('refund_analysis_quota', { p_user_id: refundUserId, p_reason: 'all_providers_failed' });
  }
  res.end();
}

async function readBody(req: ApiReq): Promise<AnalyzeRequest> {
  if (req.body && typeof req.body === 'object') return req.body as AnalyzeRequest;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve(text ? JSON.parse(text) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}
