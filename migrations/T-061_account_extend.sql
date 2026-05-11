-- ============================================================
-- T-061 계정 확장 + cal 정책 변경 (idempotent)
-- 1) public.users에 age/gender 컬럼 추가 (사용자 계정 정보)
-- 2) cal_transactions type에 'auto_recharge' 추가
-- 3) consume_analysis_quota RPC 재작성
--    - free 한도(3회/일) 분기 폐기 — 모든 분석 = 1 cal 차감
--    - 자정 KST 만료 시 cal_balance = max(현재, 3) 자동 충전 (결제 cal 보존)
--    - 자동 충전 실제 발생 시 cal_transactions에 'auto_recharge' 로그
-- 4) admin 무제한 분기는 보존 (역할 분기 그대로)
-- 실행: Supabase Dashboard → SQL Editor → 본 파일 통째로 붙여넣고 Run
-- ============================================================

-- 1. 계정 컬럼 추가 (nullable — 기존 사용자는 NULL 시작, AccountModal에서 입력)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS age int4
    CHECK (age IS NULL OR (age >= 1 AND age <= 150)),
  ADD COLUMN IF NOT EXISTS gender text
    CHECK (gender IS NULL OR gender IN ('male', 'female'));

-- 2. cal_transactions.type CHECK 갱신 — 'auto_recharge' 추가
ALTER TABLE cal_transactions DROP CONSTRAINT IF EXISTS cal_transactions_type_check;
ALTER TABLE cal_transactions ADD CONSTRAINT cal_transactions_type_check
  CHECK (type IN (
    'init',
    'analyze_charge',
    'ad_reward',
    'payment_reward',
    'refund',
    'admin_adjust',
    'auto_recharge'     -- T-061: 자정 KST 자동 보충
  ));

-- 3. consume_analysis_quota 재작성
CREATE OR REPLACE FUNCTION consume_analysis_quota(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user record;
  v_now timestamptz := now();
  v_next_reset timestamptz;
  v_recharge int4;
BEGIN
  -- row-level lock
  SELECT id, role, cal_balance, daily_usage_reset_at
    INTO v_user
    FROM public.users
    WHERE id = p_user_id
    FOR UPDATE;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  -- admin 무제한 (분기 보존)
  IF v_user.role = 'admin' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'consumed', 'admin',
      'cal_balance', v_user.cal_balance,
      'daily_usage_reset_at', v_user.daily_usage_reset_at
    );
  END IF;

  -- 자정 KST 만료 시 자동 충전: cal_balance = GREATEST(현재, 3)
  -- 결제 충전된 cal은 보존 (잔액이 3 이상이면 그대로).
  IF v_now >= v_user.daily_usage_reset_at THEN
    v_next_reset := (date_trunc('day', (v_now AT TIME ZONE 'Asia/Seoul'))
                     AT TIME ZONE 'Asia/Seoul') + interval '1 day';
    v_recharge := GREATEST(0, 3 - v_user.cal_balance);

    UPDATE public.users
      SET cal_balance = GREATEST(cal_balance, 3),
          daily_usage_count = 0,
          daily_usage_reset_at = v_next_reset
      WHERE id = p_user_id;

    v_user.cal_balance := v_user.cal_balance + v_recharge;
    v_user.daily_usage_reset_at := v_next_reset;

    -- 실제 보충 발생 시만 로그 (잔액이 이미 3 이상이면 0)
    IF v_recharge > 0 THEN
      INSERT INTO cal_transactions (user_id, type, amount, balance_after, metadata)
        VALUES (
          p_user_id,
          'auto_recharge',
          v_recharge,
          v_user.cal_balance,
          jsonb_build_object('reason', 'daily_floor_3', 'reset_at', v_next_reset)
        );
    END IF;
  END IF;

  -- cal 잔액 차감 (모든 분석 = 1 cal, free 분기 없음)
  IF v_user.cal_balance < 1 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_cal',
      'cal_balance', 0,
      'daily_usage_reset_at', v_user.daily_usage_reset_at
    );
  END IF;

  UPDATE public.users
    SET cal_balance = cal_balance - 1
    WHERE id = p_user_id;

  INSERT INTO cal_transactions (user_id, type, amount, balance_after, metadata)
    VALUES (p_user_id, 'analyze_charge', -1, v_user.cal_balance - 1, '{}'::jsonb);

  RETURN jsonb_build_object(
    'ok', true,
    'consumed', 'cal',
    'cal_balance', v_user.cal_balance - 1,
    'daily_usage_reset_at', v_user.daily_usage_reset_at
  );
END;
$$;

-- 실행 권한 — anon/authenticated에는 부여 X. service_role만 호출 가능 (T-047 동일).
REVOKE ALL ON FUNCTION consume_analysis_quota(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 끝
-- ============================================================
