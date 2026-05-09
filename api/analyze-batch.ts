import type { ApiReq, ApiRes, AIProvider, AnalysisMode } from './_lib/types';
import {
  callProvider, FALLBACK_ORDER, PROVIDER_AVAILABLE, isQuotaError,
} from './_lib/providers';
import { parseResult, JSONParseError } from './_lib/parse';
import { buildQuickPrompt } from './_lib/prompt';
import { checkRateLimit } from './_lib/rateLimit';

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

  const body: BatchRequest = await readBody(req);
  const { images, age, gender, mode = 'quick', provider = 'groq' } = body;

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

  send(res, { type: 'done' });
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
