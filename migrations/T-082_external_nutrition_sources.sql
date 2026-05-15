-- ============================================================
-- T-082 외부 영양 출처 로그/캐시 (idempotent)
-- 내부 foods 매칭이 낮을 때 Open Food Facts 등 외부 공개 식품 DB로 보정한 결과를 저장한다.
--
-- 실행: Supabase Dashboard → SQL Editor → 본 파일 통째로 붙여넣고 Run
-- 의존: T-064_fix_rls_recursion.sql (public.is_admin)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.external_nutrition_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  query text NOT NULL,
  provider text NOT NULL,
  external_id text NOT NULL,
  source_url text,
  name text NOT NULL,
  brand text,
  score real NOT NULL,
  basis text NOT NULL CHECK (basis IN ('serving', '100g')),
  calories numeric,
  protein numeric,
  carbs numeric,
  fat numeric,
  sodium numeric,
  serving_grams int,
  mode text,
  ai_provider text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_external_nutrition_sources_created
  ON public.external_nutrition_sources(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_nutrition_sources_query_trgm
  ON public.external_nutrition_sources USING gin (query gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_external_nutrition_sources_provider_external
  ON public.external_nutrition_sources(provider, external_id);

ALTER TABLE public.external_nutrition_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS external_nutrition_sources_select_admin ON public.external_nutrition_sources;
CREATE POLICY external_nutrition_sources_select_admin
  ON public.external_nutrition_sources FOR SELECT
  USING (public.is_admin(auth.uid()));

-- INSERT/UPDATE/DELETE policy 없음. 서버 service_role 경로에서만 적재한다.

-- ============================================================
-- 끝
-- ============================================================
