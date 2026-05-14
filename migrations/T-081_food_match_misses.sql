-- ============================================================
-- T-081 식품 매칭 실패 로그 (idempotent)
-- 자동 DB 보정 기준(similarity > 0.7)에 못 미친 AI foodName을 모아
-- 브랜드 alias/상품 데이터 보강의 실제 실패 케이스로 활용한다.
--
-- 실행: Supabase Dashboard → SQL Editor → 본 파일 통째로 붙여넣고 Run
-- 의존: T-069_foods_schema.sql 선실행 (public.foods)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.food_match_misses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  query text NOT NULL,
  top_food_id uuid REFERENCES public.foods(id) ON DELETE SET NULL,
  top_name text,
  top_brand text,
  top_similarity real,
  provider text,
  mode text
);

CREATE INDEX IF NOT EXISTS idx_food_match_misses_created
  ON public.food_match_misses(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_food_match_misses_query_trgm
  ON public.food_match_misses USING gin (query gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_food_match_misses_user_created
  ON public.food_match_misses(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.food_match_misses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS food_match_misses_select_admin ON public.food_match_misses;
CREATE POLICY food_match_misses_select_admin
  ON public.food_match_misses FOR SELECT
  USING (public.is_admin(auth.uid()));

-- INSERT/UPDATE/DELETE policy 없음. 서버 service_role 경로에서만 적재한다.

-- ============================================================
-- 끝
-- ============================================================
