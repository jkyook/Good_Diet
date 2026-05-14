// POST /api/cal/charge/ad — 광고 시청 보상 (+1 cal)
// 실 AdMob SSV 검증 전까지는 기본 차단. 로컬/QA에서만 ALLOW_UNVERIFIED_AD_REWARD=true 로 임시 허용.
import type { ApiReq, ApiRes } from '../../_lib/types.js';
import { handlePreflight } from '../../_lib/cors.js';
import { verifyJwt, getServiceClient, isServiceAvailable } from '../../_lib/auth.js';
import { AD_REWARD_CAL } from '../../../src/config/packages.js';

interface AdChargeBody {
  ssvToken?: string;
  adUnitId?: string;
  adProvider?: string;
}

async function readBody(req: ApiReq): Promise<AdChargeBody> {
  if (req.body && typeof req.body === 'object') return req.body as AdChargeBody;
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
  const ssvToken = body.ssvToken;
  const adUnitId = body.adUnitId ?? 'dummy';
  const adProvider = body.adProvider ?? 'admob';

  if (!ssvToken) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'missing_ssv_token' }));
    return;
  }

  const allowUnverifiedReward = process.env.ALLOW_UNVERIFIED_AD_REWARD === 'true';
  if (!allowUnverifiedReward) {
    res.statusCode = 501;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'ad_ssv_verification_required' }));
    return;
  }

  // TODO(T-048): AdMob SSV 토큰 Google 공개키 서명 검증. 아래 경로는 로컬/QA 임시 허용 전용.
  const supabase = getServiceClient();
  const insertAdView = await supabase.from('ad_views').insert({
    user_id: auth.userId,
    ad_provider: adProvider,
    ad_unit_id: adUnitId,
    reward_cal: AD_REWARD_CAL,
    status: 'completed',
    ssv_token: ssvToken,
  }).select().maybeSingle();

  // UNIQUE 충돌 = 23505 중복 보상 시도
  if (insertAdView.error) {
    if (insertAdView.error.code === '23505') {
      res.statusCode = 409;
      res.end(JSON.stringify({ error: 'duplicate_reward' }));
      return;
    }
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'ad_view_insert_failed', detail: insertAdView.error.message }));
    return;
  }

  const grant = await supabase.rpc('grant_cal_reward', {
    p_user_id: auth.userId,
    p_amount: AD_REWARD_CAL,
    p_type: 'ad_reward',
    p_metadata: { ad_unit_id: adUnitId, ad_provider: adProvider, ad_view_id: insertAdView.data?.id },
  });

  if (grant.error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'grant_failed', detail: grant.error.message }));
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, cal_balance: (grant.data as { cal_balance: number }).cal_balance }));
}
