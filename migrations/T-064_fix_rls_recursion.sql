-- ============================================================
-- T-064 RLS infinite recursion fix
-- 원인: T-047 §1.3 정책의 EXISTS (SELECT 1 FROM public.users ...) 패턴이
--       users 자체 RLS를 다시 발동 → 무한 재귀
-- 해결: SECURITY DEFINER 함수 is_admin()으로 wrap (RLS bypass)
-- idempotent: 함수 OR REPLACE, policy DROP IF EXISTS
-- 실행: Supabase Dashboard → SQL Editor → 본 파일 통째로 붙여넣고 Run
-- ============================================================

-- 1. SECURITY DEFINER 함수: admin 여부 (RLS bypass)
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id AND role = 'admin'
  );
$$;

-- 2. users SELECT policy 재작성 (재귀 회피)
DROP POLICY IF EXISTS "users_select_own_or_admin" ON public.users;
CREATE POLICY "users_select_own_or_admin" ON public.users FOR SELECT
  USING (id = auth.uid() OR public.is_admin(auth.uid()));

-- 3. cal_transactions SELECT policy 재작성
DROP POLICY IF EXISTS "cal_transactions_select_own_or_admin" ON cal_transactions;
CREATE POLICY "cal_transactions_select_own_or_admin"
  ON cal_transactions FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 4. payment_orders SELECT policy 재작성
DROP POLICY IF EXISTS "payment_orders_select_own_or_admin" ON payment_orders;
CREATE POLICY "payment_orders_select_own_or_admin"
  ON payment_orders FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 5. ad_views SELECT policy 재작성
DROP POLICY IF EXISTS "ad_views_select_own_or_admin" ON ad_views;
CREATE POLICY "ad_views_select_own_or_admin"
  ON ad_views FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 6. meal_history UPDATE policy 보강 (T-055에서 추가됐을 수도, idempotent하게 재선언)
-- 사용자가 자기 식사만 update 가능 + admin 전체
DROP POLICY IF EXISTS "meal_history_update_own_or_admin" ON meal_history;
CREATE POLICY "meal_history_update_own_or_admin"
  ON meal_history FOR UPDATE
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 검증: SELECT * FROM public.users WHERE id = auth.uid()
-- 더 이상 infinite recursion 발생 안 해야 함
