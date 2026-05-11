// POST /api/admin/cal/adjust — 운영자 수동 cal 조정
import type { ApiReq, ApiRes } from '../../_lib/types.js';
import { handlePreflight } from '../../_lib/cors.js';
import { requireAdmin, getServiceClient, isServiceAvailable } from '../../_lib/auth.js';

interface AdjustBody {
  userId?: string;
  amount?: number;
  reason?: string;
}

async function readBody(req: ApiReq): Promise<AdjustBody> {
  if (req.body && typeof req.body === 'object') return req.body as AdjustBody;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve(text ? JSON.parse(text) : {});
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req: ApiReq, res: ApiRes) {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') {
    res.statusCode = 405; res.setHeader('Allow', 'POST, OPTIONS');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }
  if (!isServiceAvailable()) {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: 'service_unavailable' }));
    return;
  }

  let admin;
  try { admin = await requireAdmin(req); }
  catch (e) {
    const msg = e instanceof Error ? e.message : 'forbidden';
    res.statusCode = msg === 'unauthorized' ? 401 : 403;
    res.end(JSON.stringify({ error: msg }));
    return;
  }

  const body = await readBody(req);
  if (!body.userId || typeof body.amount !== 'number' || !Number.isInteger(body.amount) || body.amount === 0) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'invalid_request' }));
    return;
  }

  const supabase = getServiceClient();
  const grant = await supabase.rpc('grant_cal_reward', {
    p_user_id: body.userId,
    p_amount: body.amount,
    p_type: 'admin_adjust',
    p_metadata: { admin_id: admin.userId, reason: body.reason ?? null },
  });
  if (grant.error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'adjust_failed', detail: grant.error.message }));
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, cal_balance: (grant.data as { cal_balance: number }).cal_balance }));
}
