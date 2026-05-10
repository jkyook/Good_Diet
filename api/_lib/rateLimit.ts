// 단순 in-memory 토큰 버킷. 서버리스 인스턴스가 cold-start 시 초기화되므로
// 엄격한 글로벌 한도가 아닌 인스턴스별 도배 방지 가드 정도의 효과만 가짐.
// (정밀 한도는 추후 Vercel KV / Upstash 도입 시 강화)
import type { ApiReq } from './types.js';

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();
const MAX_TOKENS = 10;        // 1분당 최대 10회
const REFILL_PER_SEC = MAX_TOKENS / 60;
const KEY_TTL_MS = 10 * 60 * 1000; // 10분 미사용 시 정리

function pickHeader(h: string | string[] | undefined): string | undefined {
  if (!h) return undefined;
  return Array.isArray(h) ? h[0] : h;
}

// IP 추출. Vercel 환경에서는 x-real-ip / x-vercel-forwarded-for 가 신뢰 가능.
// x-forwarded-for 는 클라이언트가 임의로 주입할 수 있어 마지막 fallback 으로만 사용.
function getKey(req: ApiReq): string {
  const realIp = pickHeader(req.headers['x-real-ip']);
  if (realIp) return realIp.trim();

  const vercelXff = pickHeader(req.headers['x-vercel-forwarded-for']);
  if (vercelXff) return vercelXff.split(',')[0].trim();

  // 마지막 fallback: 일반 x-forwarded-for + socket. 신뢰도 낮음.
  const xff = pickHeader(req.headers['x-forwarded-for']);
  if (xff) return xff.split(',')[0].trim();

  return req.socket.remoteAddress || 'unknown';
}

function gc() {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (now - b.lastRefill > KEY_TTL_MS) buckets.delete(k);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfter?: number;
}

export function checkRateLimit(req: ApiReq): RateLimitResult {
  if (Math.random() < 0.01) gc(); // 호출 1%에서 정리

  const key = getKey(req);
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: MAX_TOKENS, lastRefill: now };

  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + elapsed * REFILL_PER_SEC);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    const retryAfter = Math.ceil((1 - bucket.tokens) / REFILL_PER_SEC);
    buckets.set(key, bucket);
    return { ok: false, remaining: 0, retryAfter };
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return { ok: true, remaining: Math.floor(bucket.tokens) };
}
