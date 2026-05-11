-- ============================================================
-- T-069 식품 매칭 시스템 — 스키마/인덱스/RLS/RPC (idempotent)
-- 1) foods / food_aliases / food_match_corrections 테이블
-- 2) pg_trgm GIN 인덱스
-- 3) RLS (foods/aliases SELECT all, corrections own/admin)
-- 4) match_food_by_name RPC
-- 실행: Supabase Dashboard → SQL Editor → 본 파일 통째로 붙여넣고 Run
-- 의존: T-064에서 public.is_admin(uuid) 함수 생성됨
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 1. 테이블 ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_normalized text NOT NULL,
  source text NOT NULL,                    -- 'public_data' | 'mfds' | 'franchise' | 'user_input'
  source_id text,                          -- 원본 데이터 ID
  category text,
  serving_grams int4,
  calories numeric(6,2),                   -- per serving
  protein numeric(6,2),
  carbs numeric(6,2),
  fat numeric(6,2),
  fiber numeric(6,2),
  sodium numeric(6,2),                     -- mg
  brand text,                              -- 시판 상품/프랜차이즈
  barcode text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- source + source_id 중복 방지 (upsert onConflict 키)
CREATE UNIQUE INDEX IF NOT EXISTS idx_foods_source_source_id
  ON public.foods (source, source_id)
  WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.food_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id uuid NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_normalized text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.food_match_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  meal_history_id uuid,                    -- 약결합 (FK X — meal_history 삭제 시 보존)
  ai_result_food_name text,
  matched_food_id uuid REFERENCES public.foods(id) ON DELETE SET NULL,
  user_correction text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'merged')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 2. 인덱스 (Phase 1: pg_trgm) ─────────────────────────────

CREATE INDEX IF NOT EXISTS idx_foods_name_trgm
  ON public.foods USING gin (name_normalized gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_food_aliases_alias_trgm
  ON public.food_aliases USING gin (alias_normalized gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_foods_category ON public.foods(category);
CREATE INDEX IF NOT EXISTS idx_foods_brand    ON public.foods(brand);
CREATE INDEX IF NOT EXISTS idx_foods_barcode  ON public.foods(barcode) WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_corrections_user_created
  ON public.food_match_corrections(user_id, created_at DESC);

-- ── 3. RLS ───────────────────────────────────────────────────

ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS foods_select_all ON public.foods;
CREATE POLICY foods_select_all ON public.foods FOR SELECT USING (true);
-- INSERT/UPDATE/DELETE policy 없음 = service_role만 가능

ALTER TABLE public.food_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS food_aliases_select_all ON public.food_aliases;
CREATE POLICY food_aliases_select_all ON public.food_aliases FOR SELECT USING (true);

ALTER TABLE public.food_match_corrections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS food_corrections_insert_own ON public.food_match_corrections;
CREATE POLICY food_corrections_insert_own ON public.food_match_corrections FOR INSERT
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS food_corrections_select_own_or_admin ON public.food_match_corrections;
CREATE POLICY food_corrections_select_own_or_admin ON public.food_match_corrections FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- ── 4. 매칭 RPC ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.match_food_by_name(
  p_query text,
  p_limit int DEFAULT 5,
  p_min_similarity real DEFAULT 0.3
) RETURNS TABLE (
  food_id uuid,
  name text,
  category text,
  calories numeric,
  protein numeric,
  carbs numeric,
  fat numeric,
  serving_grams int,
  brand text,
  similarity real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    f.id, f.name, f.category, f.calories, f.protein, f.carbs, f.fat, f.serving_grams, f.brand,
    similarity(f.name_normalized, lower(trim(p_query))) AS sim
  FROM public.foods f
  WHERE f.name_normalized % lower(trim(p_query))
    AND similarity(f.name_normalized, lower(trim(p_query))) >= p_min_similarity
  ORDER BY sim DESC
  LIMIT p_limit;
$$;

-- alias도 매칭 (alias 일치 시 food 반환)
CREATE OR REPLACE FUNCTION public.match_food_with_aliases(
  p_query text,
  p_limit int DEFAULT 5,
  p_min_similarity real DEFAULT 0.3
) RETURNS TABLE (
  food_id uuid,
  name text,
  category text,
  calories numeric,
  protein numeric,
  carbs numeric,
  fat numeric,
  serving_grams int,
  brand text,
  matched_via text,                        -- 'name' | 'alias'
  similarity real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  WITH q AS (SELECT lower(trim(p_query)) AS qn),
  name_hits AS (
    SELECT f.id, f.name, f.category, f.calories, f.protein, f.carbs, f.fat,
           f.serving_grams, f.brand,
           'name'::text AS matched_via,
           similarity(f.name_normalized, q.qn) AS sim
    FROM public.foods f, q
    WHERE f.name_normalized % q.qn
      AND similarity(f.name_normalized, q.qn) >= p_min_similarity
  ),
  alias_hits AS (
    SELECT f.id, f.name, f.category, f.calories, f.protein, f.carbs, f.fat,
           f.serving_grams, f.brand,
           'alias'::text AS matched_via,
           similarity(a.alias_normalized, q.qn) AS sim
    FROM public.food_aliases a
    JOIN public.foods f ON f.id = a.food_id, q
    WHERE a.alias_normalized % q.qn
      AND similarity(a.alias_normalized, q.qn) >= p_min_similarity
  ),
  merged AS (
    SELECT * FROM name_hits
    UNION ALL
    SELECT * FROM alias_hits
  ),
  best AS (
    SELECT DISTINCT ON (id)
      id, name, category, calories, protein, carbs, fat,
      serving_grams, brand, matched_via, sim
    FROM merged
    ORDER BY id, sim DESC
  )
  SELECT id, name, category, calories, protein, carbs, fat,
         serving_grams, brand, matched_via, sim
  FROM best
  ORDER BY sim DESC
  LIMIT p_limit;
$$;

-- service_role만 변형 가능. anon/authenticated에는 SELECT 가능한 RPC만 EXECUTE 허용.
GRANT EXECUTE ON FUNCTION public.match_food_by_name(text, int, real) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_food_with_aliases(text, int, real) TO anon, authenticated;

-- ============================================================
-- 끝
-- ============================================================
