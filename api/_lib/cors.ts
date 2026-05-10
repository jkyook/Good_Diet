// CORS 헤더 + OPTIONS preflight 처리.
// 모바일(Capacitor) 빌드는 절대 URL 로 /api 를 호출하므로 cross-origin 요청이 됨.
// Capacitor iOS: capacitor://localhost, Android: https://localhost
// 웹: same-origin 이지만 명시적으로 허용해 두면 dev 서버(예: 다른 포트)에서도 동작.
import type { ApiReq, ApiRes } from './types.js';

const ALLOWED_ORIGINS = new Set<string>([
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'http://localhost',
  'http://localhost:3000',
  'http://localhost:5173',
  'https://good-diet.vercel.app',
]);

const ALLOWED_VERCEL_PREVIEW = /^https:\/\/good-diet-[\w-]+\.vercel\.app$/;

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (ALLOWED_VERCEL_PREVIEW.test(origin)) return true;
  return false;
}

export function applyCors(req: ApiReq, res: ApiRes): void {
  const origin = (Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin) as string | undefined;
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin!);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/**
 * OPTIONS preflight 라면 204 로 즉시 응답하고 true 반환.
 * 호출 측은 true 시 그대로 함수 종료.
 */
export function handlePreflight(req: ApiReq, res: ApiRes): boolean {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}
