-- ============================================================
-- T-055b meal_history 편집 권한 + 제약 (idempotent)
-- 식사 mealType + date 편집을 위한 RLS UPDATE 정책 + 컬럼 단위 GRANT + CHECK.
-- 실행: Supabase Dashboard → SQL Editor → 본 파일 통째로 붙여넣고 Run
-- 사전 점검: SELECT DISTINCT meal_type FROM public.meal_history;
--          → 결과가 ('breakfast','lunch','dinner','snack') 외 값을 포함하면 §5 CHECK 실패. 사전 정규화 필요.
-- ============================================================

-- 1. RLS 활성화 (이미 활성이면 noop)
ALTER TABLE public.meal_history ENABLE ROW LEVEL SECURITY;

-- 2. UPDATE 정책: 자기 행만 수정. admin은 전체.
DROP POLICY IF EXISTS "meal_history_update_own_or_admin" ON public.meal_history;
CREATE POLICY "meal_history_update_own_or_admin"
  ON public.meal_history FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- 3. SELECT/INSERT/DELETE 정책은 이전 마이그레이션에서 정의되어 있다고 가정.
--    만약 없으면 별도 hotfix 마이그레이션으로 분리.

-- 4. 컬럼 단위 권한 — 편집 가능 컬럼만 UPDATE 허용.
--    food_name, calories 등은 클라이언트가 직접 못 바꾸도록 차단.
REVOKE UPDATE ON public.meal_history FROM anon, authenticated;
GRANT  UPDATE (meal_type, analyzed_at) ON public.meal_history TO authenticated;

-- 5. meal_type 유효값 CHECK (이미 있으면 무시)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meal_history_meal_type_check'
  ) THEN
    ALTER TABLE public.meal_history
      ADD CONSTRAINT meal_history_meal_type_check
      CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack'));
  END IF;
END$$;

-- 6. (선택) updated_at 컬럼 — 향후 낙관 동시성/감사용 자리만 마련.
ALTER TABLE public.meal_history
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;
-- 본 티켓에서는 트리거 미설정. 추후 필요 시 BEFORE UPDATE 트리거로 NEW.updated_at = now() 추가.

-- ============================================================
-- 끝
-- ============================================================
