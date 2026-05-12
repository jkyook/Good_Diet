-- ============================================================
-- T-077 meal_history INSERT/SELECT/DELETE policy hotfix
-- 원인: T-055d (commit c0d8843, migrations/T-055_meal_edit.sql line 10)에서
--       ALTER TABLE public.meal_history ENABLE ROW LEVEL SECURITY 만 적용하고
--       SELECT/INSERT/DELETE 정책을 누락 (line 25 주석 "이전 마이그레이션에 있다고 가정" — 실제로 없었음).
-- 증상: T-055d 이후 saveMeal()의 upsert가 RLS default-deny에 막혀 INSERT 무음 실패.
--       App.tsx:485 saveMeal 에러 무시 → UI는 "분석 완료!" 토스트 표시하나 DB 미저장.
--       새로고침 시 신규 분석 사라짐.
-- 해결: INSERT/SELECT/DELETE 정책 명시. is_admin은 T-064 SECURITY DEFINER 함수 재사용.
-- idempotent: 함수 OR REPLACE 아님 (policy DROP IF EXISTS).
-- 실행: Supabase Dashboard → SQL Editor → 본 파일 통째로 붙여넣고 Run
-- 의존: T-055_meal_edit.sql (RLS enable), T-064_fix_rls_recursion.sql (is_admin 함수)
-- ============================================================

-- 0. RLS 활성 확인 (이미 활성이면 noop)
ALTER TABLE public.meal_history ENABLE ROW LEVEL SECURITY;

-- 1. INSERT: 자기 user_id로만 INSERT 가능
DROP POLICY IF EXISTS "meal_history_insert_own" ON public.meal_history;
CREATE POLICY "meal_history_insert_own"
  ON public.meal_history FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- 2. SELECT: 자기 행 + admin 전체
DROP POLICY IF EXISTS "meal_history_select_own_or_admin" ON public.meal_history;
CREATE POLICY "meal_history_select_own_or_admin"
  ON public.meal_history FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 3. DELETE: 자기 행만 (admin은 별도 결정 — 현 정책은 자기만)
DROP POLICY IF EXISTS "meal_history_delete_own" ON public.meal_history;
CREATE POLICY "meal_history_delete_own"
  ON public.meal_history FOR DELETE
  USING (user_id = auth.uid());

-- 4. UPDATE policy는 T-055_meal_edit / T-064에서 이미 정의됨 (재선언 불요).
--    REVOKE UPDATE FROM anon,authenticated + GRANT UPDATE (meal_type, analyzed_at)도 그대로 유효.

-- 검증 쿼리 (선택 — Dashboard에서 직접 SELECT * FROM public.meal_history WHERE user_id = auth.uid() LIMIT 1 가능 여부 확인)
-- 적용 후 즉시 모바일/웹에서 신규 분석 1건 후 새로고침 — DB 영속 확인.

-- ============================================================
-- 끝
-- ============================================================
