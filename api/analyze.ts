import type { ApiReq, ApiRes, AnalyzeRequest, AIProvider } from './_lib/types';
import {
  callProvider, FALLBACK_ORDER, PROVIDER_AVAILABLE, PROVIDER_LABELS, isQuotaError,
} from './_lib/providers';
import { parseResult, JSONParseError } from './_lib/parse';
import { buildQuickPrompt, buildDetailedPrompt } from './_lib/prompt';
import { checkRateLimit } from './_lib/rateLimit';

function send(res: ApiRes, payload: unknown) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export default async function handler(req: ApiReq, res: ApiRes) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
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
  const { imageData, age, gender, existingMealsCount = 0, mode = 'detailed', provider = 'groq' } = body;

  if (!imageData || !age || !gender) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'imageData, age, gender 가 필요합니다.' }));
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const prompt = mode === 'quick'
    ? buildQuickPrompt(age, gender)
    : buildDetailedPrompt(age, gender, existingMealsCount + 1);
  const base64Data = imageData.split(',')[1] || imageData;

  const ordered: AIProvider[] = [
    provider,
    ...FALLBACK_ORDER.filter(p => p !== provider),
  ].filter(p => PROVIDER_AVAILABLE[p]);

  if (ordered.length === 0) {
    send(res, { type: 'error', message: '사용 가능한 AI 프로바이더가 없습니다 (서버 키 누락).' });
    res.end();
    return;
  }

  let lastErrMsg = '';
  for (const cur of ordered) {
    try {
      send(res, { type: 'step', index: 0, detail: `${PROVIDER_LABELS[cur]} 연결 완료` });
      const text = await callProvider(cur, base64Data, prompt, mode);
      const result = parseResult(text, mode, cur);

      send(res, { type: 'step', index: 1, detail: `"${result.foodName}" 감지됨` });
      send(res, { type: 'step', index: 2, detail: `${result.calories} kcal | ${result.weightGrams}g 산출됨` });
      send(res, { type: 'step', index: 3, detail: result.portionEstimate ? `${result.portionEstimate.referenceObject} 기준 추정` : '분류 완료' });
      send(res, { type: 'step', index: 4, detail: `신뢰도: ${result.confidence ?? '중간'}` });
      send(res, { type: 'done', result });
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
      res.end();
      return;
    }
  }

  send(res, { type: 'error', message: `모든 AI 서비스 실패: ${lastErrMsg}` });
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
