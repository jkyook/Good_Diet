// POST /api/cal/charge/payment/webhook — PG webhook (결제 완료 알림)
// B3: status 단방향 전이 (pending → paid/failed/cancelled). 중복 보상 차단.
// 실 토스 서명 검증은 T-049 후속. 본 구현은 골격만 + status 단방향만 보장.
import type { ApiReq, ApiRes } from '../../../_lib/types.js';
import { handlePreflight } from '../../../_lib/cors.js';
import { getServiceClient, isServiceAvailable } from '../../../_lib/auth.js';

interface WebhookBody {
  orderId?: string;
  status?: string;
  paymentKey?: string;
}

async function readBody(req: ApiReq): Promise<WebhookBody> {
  if (req.body && typeof req.body === 'object') return req.body as WebhookBody;
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
    res.end();
    return;
  }

  // TODO(T-049): 토스페이먼츠 webhook 서명 검증 (Toss-Signature 헤더).
  // const verified = verifyTossSignature(req); if (!verified) return res.status(401).end();

  const body = await readBody(req);
  const orderId = body.orderId;
  const status = (body.status ?? '').toUpperCase();
  if (!orderId) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'missing_order_id' }));
    return;
  }

  const supabase = getServiceClient();
  const orderQ = await supabase.from('payment_orders').select('*').eq('pg_order_id', orderId).maybeSingle();
  if (!orderQ.data) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'order_not_found' }));
    return;
  }

  if (status === 'DONE' || status === 'PAID') {
    // 단방향 전이: pending → paid만 (재시도 시 0 row update → 중복 보상 차단)
    const upd = await supabase.from('payment_orders').update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      pg_payment_key: body.paymentKey ?? null,
    }).eq('id', orderQ.data.id).eq('status', 'pending').select().maybeSingle();

    if (!upd.data) {
      // 이미 paid/cancelled/refunded — webhook 재시도. grant 건너뜀.
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, skipped: 'already_processed' }));
      return;
    }

    const grant = await supabase.rpc('grant_cal_reward', {
      p_user_id: orderQ.data.user_id,
      p_amount: orderQ.data.package_cal,
      p_type: 'payment_reward',
      p_metadata: { payment_order_id: orderQ.data.id, krw: orderQ.data.package_krw },
    });
    if (grant.error) {
      // grant 실패 — 운영자 수동 개입 필요. 일단 webhook은 200 (PG가 재시도하지 않게).
      console.error('[payment/webhook] grant_failed', grant.error);
    }
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, granted: orderQ.data.package_cal }));
    return;
  }

  // 실패/취소: pending → failed/cancelled만
  const nextStatus = status === 'CANCELED' || status === 'CANCELLED' ? 'cancelled' : 'failed';
  await supabase.from('payment_orders').update({ status: nextStatus })
    .eq('id', orderQ.data.id).eq('status', 'pending');
  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, status: nextStatus }));
}
