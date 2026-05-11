// JWT 인증 헬퍼 — 모든 API 진입점에서 verifyJwt 호출.
// Supabase 자체 JWT 검증 + DB role 재확인 (custom claim 신뢰 X).
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ApiReq } from './types.js';

let cachedAdmin: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env가 필요합니다.');
  }
  cachedAdmin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedAdmin;
}

export interface AuthContext {
  userId: string;
  email: string | null;
  role: 'user' | 'admin';
}

export function isServiceAvailable(): boolean {
  return !!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) &&
         !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function extractBearer(req: ApiReq): string | null {
  const header = req.headers['authorization'];
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw || !raw.toLowerCase().startsWith('bearer ')) return null;
  return raw.slice(7).trim() || null;
}

export async function verifyJwt(req: ApiReq): Promise<AuthContext | null> {
  const token = extractBearer(req);
  if (!token) return null;
  if (!isServiceAvailable()) return null;

  const supabase = getServiceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  // DB role 재확인 — JWT custom claim은 위변조 가능하므로 항상 DB 재조회.
  const { data: row } = await supabase
    .from('users')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();

  const role: 'user' | 'admin' = row?.role === 'admin' ? 'admin' : 'user';
  return { userId: data.user.id, email: data.user.email ?? null, role };
}

export async function requireAdmin(req: ApiReq): Promise<AuthContext> {
  const auth = await verifyJwt(req);
  if (!auth) throw new Error('unauthorized');
  if (auth.role !== 'admin') throw new Error('forbidden');
  return auth;
}
