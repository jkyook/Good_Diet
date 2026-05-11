// GET /api/admin/users — admin 전용 사용자 목록
import type { ApiReq, ApiRes } from '../_lib/types.js';
import { handlePreflight } from '../_lib/cors.js';
import { requireAdmin, getServiceClient, isServiceAvailable } from '../_lib/auth.js';

export default async function handler(req: ApiReq, res: ApiRes) {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET') {
    res.statusCode = 405; res.setHeader('Allow', 'GET, OPTIONS');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }
  if (!isServiceAvailable()) {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: 'service_unavailable' }));
    return;
  }

  try {
    await requireAdmin(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'forbidden';
    res.statusCode = msg === 'unauthorized' ? 401 : 403;
    res.end(JSON.stringify({ error: msg }));
    return;
  }

  const url = new URL(req.url || '', 'http://localhost');
  const search = url.searchParams.get('q')?.trim() ?? '';
  const limitRaw = parseInt(url.searchParams.get('limit') || '', 10);
  const limit = Math.min(200, Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50);

  const supabase = getServiceClient();
  let q = supabase.from('users')
    .select('id, email, role, cal_balance, daily_usage_count, daily_usage_reset_at')
    .order('email', { ascending: true })
    .limit(limit);
  if (search) q = q.ilike('email', `%${search}%`);
  const { data, error } = await q;
  if (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'query_failed', detail: error.message }));
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ items: data ?? [] }));
}
