// POST /api/cal/charge/payment/init — 결제 시작 (PG 주문 생성)
// 실 토스페이먼츠 연동은 후속(T-049). 본 구현은 payment_orders insert + dummy orderId 반환.
import type { ApiReq, ApiRes } from '../../../_lib/types.js';
import { handlePreflight } from '../../../_lib/cors.js';
import { verifyJwt, getServiceClient, isServiceAvailable } from '../../../_lib/auth.js';
import { findPackage } from '../../../../src/config/packages.js';

interface InitBody {
  packageId?: string;
}

async function readBody(req: ApiReq): Promise<InitBody> {
  if (req.body && typeof req.body === 'object') return req.body as InitBody;
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

  const auth = await verifyJwt(req);
  if (!auth) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  const body = await readBody(req);
  const pkg = body.packageId ? findPackage(body.packageId) : undefined;
  if (!pkg) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'invalid_package' }));
    return;
  }

  const supabase = getServiceClient();
  const orderInsert = await supabase.from('payment_orders').insert({
    user_id: auth.userId,
    package_cal: pkg.cal,
    package_krw: pkg.krw,
    pg_provider: 'tosspayments',
    status: 'pending',
  }).select().maybeSingle();

  if (orderInsert.error || !orderInsert.data) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'order_create_failed', detail: orderInsert.error?.message }));
    return;
  }

  // TODO(T-049): 토스페이먼츠 SDK init 호출. 본 단계는 dummy orderId.
  const pgOrderId = `dummy_${orderInsert.data.id}`;
  await supabase.from('payment_orders')
    .update({ pg_order_id: pgOrderId })
    .eq('id', orderInsert.data.id);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    orderId: pgOrderId,
    paymentOrderId: orderInsert.data.id,
    packageId: pkg.id,
    cal: pkg.cal,
    krw: pkg.krw,
    pgProvider: 'tosspayments',
  }));
}
