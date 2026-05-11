// GET /api/me — 현재 사용자 정보 (role, cal_balance, daily_usage_count, reset_at)
import type { ApiReq, ApiRes } from './_lib/types.js';
import { handlePreflight } from './_lib/cors.js';
import { verifyJwt, getServiceClient, isServiceAvailable } from './_lib/auth.js';

export default async function handler(req: ApiReq, res: ApiRes) {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, OPTIONS');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }
  if (!isServiceAvailable()) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'service_unavailable' }));
    return;
  }

  const auth = await verifyJwt(req);
  if (!auth) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, email, role, cal_balance, daily_usage_count, daily_usage_reset_at, age, gender')
    .eq('id', auth.userId)
    .maybeSingle();

  if (error || !data) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'user_not_found' }));
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    id: data.id,
    email: data.email,
    role: data.role,
    cal_balance: data.cal_balance,
    daily_usage_count: data.daily_usage_count,
    daily_usage_reset_at: data.daily_usage_reset_at,
    age: data.age ?? null,
    gender: data.gender ?? null,
  }));
}
