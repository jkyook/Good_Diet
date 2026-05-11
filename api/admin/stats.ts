// GET /api/admin/stats — 광고/결제/사용자 통계
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

  try { await requireAdmin(req); }
  catch (e) {
    const msg = e instanceof Error ? e.message : 'forbidden';
    res.statusCode = msg === 'unauthorized' ? 401 : 403;
    res.end(JSON.stringify({ error: msg }));
    return;
  }

  const supabase = getServiceClient();
  const startOfDayKst = new Date();
  startOfDayKst.setUTCHours(15, 0, 0, 0); // KST 자정 = UTC 15:00 (전날)
  if (startOfDayKst.getTime() > Date.now()) startOfDayKst.setUTCDate(startOfDayKst.getUTCDate() - 1);
  const sinceISO = startOfDayKst.toISOString();

  const [adsToday, paymentsToday, usersTotal] = await Promise.all([
    supabase.from('ad_views').select('id, reward_cal', { count: 'exact', head: false })
      .eq('status', 'completed').gte('created_at', sinceISO),
    supabase.from('payment_orders').select('id, package_krw', { count: 'exact', head: false })
      .eq('status', 'paid').gte('paid_at', sinceISO),
    supabase.from('users').select('id', { count: 'exact', head: true }),
  ]);

  const adCount = adsToday.count ?? 0;
  const paymentCount = paymentsToday.count ?? 0;
  const revenueKrw = (paymentsToday.data ?? []).reduce((s, r) => s + (r.package_krw ?? 0), 0);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    sinceKstMidnight: sinceISO,
    today: {
      adViewsCompleted: adCount,
      paymentsPaid: paymentCount,
      revenueKrw,
    },
    totalUsers: usersTotal.count ?? 0,
  }));
}
