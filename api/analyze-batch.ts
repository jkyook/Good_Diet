import type { ApiReq, ApiRes, AIProvider, AnalysisMode } from './_lib/types.js';
import {
  callProvider, FALLBACK_ORDER, PROVIDER_AVAILABLE, isQuotaError,
} from './_lib/providers.js';
import { parseResult, JSONParseError } from './_lib/parse.js';
import { buildQuickPrompt } from './_lib/prompt.js';
import { checkRateLimit } from './_lib/rateLimit.js';
import { handlePreflight } from './_lib/cors.js';
import { validateImage } from './_lib/validate.js';
import { verifyJwt, getServiceClient, isServiceAvailable } from './_lib/auth.js';

interface QuotaResult {
  ok: boolean;
  consumed?: 'admin' | 'free' | 'cal';
  error?: string;
  cal_balance?: number;
  daily_usage_count?: number;
  daily_usage_reset_at?: string;
}

interface BatchRequest {
  images: string[];
  age: number;
  gender: 'male' | 'female';
  mode?: AnalysisMode;
  provider?: AIProvider;
}

function send(res: ApiRes, payload: unknown) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

const MAX_BATCH = 10;

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

  const body: BatchRequest = await readBody(req);
  const { images, age, gender, mode = 'quick', provider = 'claude' } = body;

  if (!Array.isArray(images) || images.length === 0 || !age || !gender) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'images[], age, gender 가 필요합니다.' }));
    return;
  }
  if (images.length > MAX_BATCH) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `한 번에 최대 ${MAX_BATCH}장까지 가능합니다.` }));
    return;
  }

  for (let i = 0; i < images.length; i++) {
    const imageErr = validateImage(images[i]);
    if (imageErr) {
      res.statusCode = imageErr.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `images[${i}]: ${imageErr.error}` }));
      return;
    }
  }

  // 배치 1건 = 1 cal 차감 (사용자 결정 Q2 B).
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
  let anySuccess = false;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const ordered: AIProvider[] = [provider, ...FALLBACK_ORDER.filter(p => p !== provider)]
    .filter(p => PROVIDER_AVAILABLE[p]);

  if (ordered.length === 0) {
    send(res, { type: 'error', message: '사용 가능한 AI 프로바이더가 없습니다 (서버 키 누락).' });
    res.end();
    return;
  }

  const prompt = buildQuickPrompt(age, gender);

  for (let i = 0; i < images.length; i++) {
    const base64Data = images[i].split(',')[1] || images[i];
    let resolved = false;
    let lastErr = '';

    for (const cur of ordered) {
      try {
        const text = await callProvider(cur, base64Data, prompt, mode);
        const result = parseResult(text, mode, cur);
        send(res, { type: 'item', index: i, result });
        resolved = true;
        anySuccess = true;
        break;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
        const recoverable = err instanceof JSONParseError || isQuotaError(lastErr);
        if (!recoverable) break;
      }
    }

    if (!resolved) send(res, { type: 'item', index: i, error: lastErr || '분석 실패' });
    send(res, { type: 'progress', completed: i + 1, total: images.length });

    if (i < images.length - 1) await new Promise(r => setTimeout(r, 300));
  }

  // 모든 이미지 실패 시 환불 (1 cal 차감이었으므로 1 cal만 환불).
  // 부분 성공도 1 cal 정책 — 환불 X (사용자 결정 Q2 B 정신).
  if (!anySuccess && supabaseForRefund && refundUserId) {
    await supabaseForRefund.rpc('refund_analysis_quota', { p_user_id: refundUserId, p_reason: 'batch_all_failed' });
  }

  send(res, { type: 'done', quota });
  res.end();
}

async function readBody(req: ApiReq): Promise<BatchRequest> {
  if (req.body && typeof req.body === 'object') return req.body as BatchRequest;
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
