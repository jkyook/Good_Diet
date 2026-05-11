-- ============================================================
-- T-047 fatguard cal 시스템 마이그레이션
-- idempotent: 여러 번 실행해도 안전 (IF NOT EXISTS / OR REPLACE)
-- 실행: Supabase Dashboard → SQL Editor → 본 파일 통째로 붙여넣고 Run
-- ============================================================

-- ============================================================
-- 0. public.users 테이블 생성 + auth.users 자동 미러 트리거 (M4 보완 2026-05-11)
--    fatguard는 기존에 public.users 부재. cal 시스템은 이 테이블에 컬럼 추가.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 신규 가입 자동 INSERT (auth.users → public.users 미러)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 기존 auth.users 백필 (이미 가입된 사용자들도 public.users에 미러)
INSERT INTO public.users (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 1. public.users 컬럼 추가 (cal_balance 기본 5, role 'user', 일일 카운터)
-- ============================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'
    CHECK (role IN ('admin', 'user')),
  ADD COLUMN IF NOT EXISTS cal_balance int4 NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS daily_usage_count int4 NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_usage_reset_at timestamptz NOT NULL
    DEFAULT (date_trunc('day', (now() AT TIME ZONE 'Asia/Seoul'))
             AT TIME ZONE 'Asia/Seoul' + interval '1 day');

-- 2. 운영자(jkyook) 승격
UPDATE public.users SET role = 'admin'
  WHERE email = 'jinkwan.yook@gmail.com';

-- 3. cal_transactions 테이블 (이력)
CREATE TABLE IF NOT EXISTS cal_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'init',            -- 초기 5개 지급
    'analyze_charge',  -- 분석 차감 (-1)
    'ad_reward',       -- 광고 시청 보상 (+1)
    'payment_reward',  -- 결제 충전
    'refund',          -- 분석 실패 환불 (+1)
    'admin_adjust'     -- 운영자 수동 조정
  )),
  amount int4 NOT NULL,                    -- 양수=충전, 음수=차감
  balance_after int4 NOT NULL,             -- 트랜잭션 직후 잔액
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cal_transactions_user_created
  ON cal_transactions(user_id, created_at DESC);

-- 4. payment_orders 테이블
CREATE TABLE IF NOT EXISTS payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  package_cal int4 NOT NULL,
  package_krw int4 NOT NULL,
  pg_provider text NOT NULL,
  pg_order_id text,
  pg_payment_key text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_status
  ON payment_orders(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_orders_pg_order_id
  ON payment_orders(pg_order_id);

-- 5. ad_views 테이블 (SSV 토큰 UNIQUE로 중복 보상 차단)
CREATE TABLE IF NOT EXISTS ad_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ad_provider text NOT NULL,
  ad_unit_id text NOT NULL,
  reward_cal int4 NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'skipped', 'failed', 'fraud_blocked')),
  ssv_token text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_views_user_status
  ON ad_views(user_id, status, created_at DESC);

-- ============================================================
-- RLS Policy
-- ============================================================

ALTER TABLE cal_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cal_transactions_select_own_or_admin" ON cal_transactions;
CREATE POLICY "cal_transactions_select_own_or_admin"
  ON cal_transactions FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_orders_select_own_or_admin" ON payment_orders;
CREATE POLICY "payment_orders_select_own_or_admin"
  ON payment_orders FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

ALTER TABLE ad_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ad_views_select_own_or_admin" ON ad_views;
CREATE POLICY "ad_views_select_own_or_admin"
  ON ad_views FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- public.users: 기존 select policy 보존 + admin 우회 추가
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_select_own_or_admin" ON public.users;
CREATE POLICY "users_select_own_or_admin" ON public.users FOR SELECT
  USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- B1 보완: 보호 컬럼은 UPDATE 권한 자체에서 REVOKE
REVOKE UPDATE (role, cal_balance, daily_usage_count, daily_usage_reset_at)
  ON public.users FROM authenticated, anon;

-- public.users UPDATE 정책: 자기 행만 (다른 컬럼만 가능)
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own_safe" ON public.users;
CREATE POLICY "users_update_own_safe" ON public.users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================
-- RPC 함수 — atomic 차감/환불/지급
-- M5 보완: SET search_path = pg_catalog, public (CVE-2018-1058)
-- ============================================================

-- 분석 차감 + 한도 체크 (atomic, FOR UPDATE)
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
BEGIN
  SELECT id, role, cal_balance, daily_usage_count, daily_usage_reset_at
    INTO v_user
    FROM public.users
    WHERE id = p_user_id
    FOR UPDATE;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  -- admin 무제한
  IF v_user.role = 'admin' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'consumed', 'admin',
      'cal_balance', v_user.cal_balance,
      'daily_usage_count', v_user.daily_usage_count,
      'daily_usage_reset_at', v_user.daily_usage_reset_at
    );
  END IF;

  -- 자정 KST 리셋 만료 체크
  IF v_now >= v_user.daily_usage_reset_at THEN
    v_next_reset := (date_trunc('day', (v_now AT TIME ZONE 'Asia/Seoul'))
                     AT TIME ZONE 'Asia/Seoul') + interval '1 day';
    UPDATE public.users
      SET daily_usage_count = 0, daily_usage_reset_at = v_next_reset
      WHERE id = p_user_id;
    v_user.daily_usage_count := 0;
    v_user.daily_usage_reset_at := v_next_reset;
  END IF;

  -- 무료 한도 (3회) 내
  IF v_user.daily_usage_count < 3 THEN
    UPDATE public.users SET daily_usage_count = daily_usage_count + 1 WHERE id = p_user_id;
    RETURN jsonb_build_object(
      'ok', true,
      'consumed', 'free',
      'daily_usage_count', v_user.daily_usage_count + 1,
      'cal_balance', v_user.cal_balance,
      'daily_usage_reset_at', v_user.daily_usage_reset_at
    );
  END IF;

  -- cal 잔액 차감
  IF v_user.cal_balance < 1 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_cal',
      'cal_balance', 0,
      'daily_usage_count', v_user.daily_usage_count,
      'daily_usage_reset_at', v_user.daily_usage_reset_at
    );
  END IF;

  UPDATE public.users SET cal_balance = cal_balance - 1 WHERE id = p_user_id;
  INSERT INTO cal_transactions (user_id, type, amount, balance_after, metadata)
    VALUES (p_user_id, 'analyze_charge', -1, v_user.cal_balance - 1, '{}'::jsonb);

  RETURN jsonb_build_object(
    'ok', true,
    'consumed', 'cal',
    'daily_usage_count', v_user.daily_usage_count,
    'cal_balance', v_user.cal_balance - 1,
    'daily_usage_reset_at', v_user.daily_usage_reset_at
  );
END;
$$;

-- 분석 실패 환불 (consumed='cal'일 때만 호출 — 호출자 책임)
CREATE OR REPLACE FUNCTION refund_analysis_quota(p_user_id uuid, p_reason text DEFAULT 'analysis_failed')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_after int4;
BEGIN
  UPDATE public.users
    SET cal_balance = cal_balance + 1
    WHERE id = p_user_id
    RETURNING cal_balance INTO v_after;

  INSERT INTO cal_transactions (user_id, type, amount, balance_after, metadata)
    VALUES (p_user_id, 'refund', 1, v_after, jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('ok', true, 'cal_balance', v_after);
END;
$$;

-- 보상 지급 단일 진입 (광고/결제/admin_adjust 공용)
CREATE OR REPLACE FUNCTION grant_cal_reward(
  p_user_id uuid,
  p_amount int4,
  p_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_after int4;
BEGIN
  IF p_type NOT IN ('init', 'ad_reward', 'payment_reward', 'admin_adjust') THEN
    RAISE EXCEPTION 'grant_cal_reward: invalid type %', p_type;
  END IF;

  UPDATE public.users
    SET cal_balance = cal_balance + p_amount
    WHERE id = p_user_id
    RETURNING cal_balance INTO v_after;

  IF v_after IS NULL THEN
    RAISE EXCEPTION 'grant_cal_reward: user_not_found %', p_user_id;
  END IF;

  INSERT INTO cal_transactions (user_id, type, amount, balance_after, metadata)
    VALUES (p_user_id, p_type, p_amount, v_after, p_metadata);

  RETURN jsonb_build_object('ok', true, 'cal_balance', v_after);
END;
$$;

-- 실행 권한 — anon/authenticated에는 부여 X. service_role만 호출 가능.
REVOKE ALL ON FUNCTION consume_analysis_quota(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION refund_analysis_quota(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION grant_cal_reward(uuid, int4, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 끝
-- ============================================================
