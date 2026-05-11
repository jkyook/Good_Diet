// GET /api/cal/transactions — 사용자 트랜잭션 이력 (page-based cursor)
import type { ApiReq, ApiRes } from '../_lib/types.js';
import { handlePreflight } from '../_lib/cors.js';
import { verifyJwt, getServiceClient, isServiceAvailable } from '../_lib/auth.js';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

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

  const auth = await verifyJwt(req);
  if (!auth) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  const url = new URL(req.url || '', 'http://localhost');
  const limitRaw = parseInt(url.searchParams.get('limit') || '', 10);
  const limit = Math.min(MAX_LIMIT, Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : DEFAULT_LIMIT);
  const cursor = url.searchParams.get('cursor'); // created_at ISO 문자열

  const supabase = getServiceClient();
  let q = supabase.from('cal_transactions')
    .select('id, type, amount, balance_after, metadata, created_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);
  if (cursor) q = q.lt('created_at', cursor);
  const { data, error } = await q;
  if (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'query_failed', detail: error.message }));
    return;
  }

  const items = (data ?? []).slice(0, limit);
  const nextCursor = (data ?? []).length > limit ? items[items.length - 1]?.created_at ?? null : null;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ items, nextCursor }));
}
