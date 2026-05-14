-- ============================================================
-- T-080 편의점/PB 브랜드 매칭 보강 (idempotent)
-- 1) mfds/public foods에 묻혀 있는 PB 브랜드명을 brand 컬럼으로 정규화
-- 2) match_food_with_aliases에 브랜드 alias 가중치와 완전 중복 접기 적용
--
-- 실행: Supabase Dashboard → SQL Editor → 본 파일 통째로 붙여넣고 Run
-- 의존: T-069_foods_schema.sql 선실행 (public.foods, public.food_aliases, pg_trgm)
-- 주의: ye!low/yellow는 색상 표현 오탐이 많아 본 migration에서 제외
-- ============================================================

UPDATE public.foods
SET brand = '유어스'
WHERE brand IS NULL
  AND source IN ('public_data_food', 'mfds_processed')
  AND (
    name ILIKE '%유어스%'
    OR name ILIKE '%YOUUS%'
    OR name ILIKE '%YOU US%'
  );

UPDATE public.foods
SET brand = '헤이루'
WHERE brand IS NULL
  AND source IN ('public_data_food', 'mfds_processed')
  AND (
    name ILIKE '%HEYROO%'
    OR name ILIKE '%헤이루%'
  );

UPDATE public.foods
SET brand = 'CU 득템'
WHERE brand IS NULL
  AND source IN ('public_data_food', 'mfds_processed')
  AND name ILIKE '%득템%';

UPDATE public.foods
SET brand = '아임e'
WHERE brand IS NULL
  AND source IN ('public_data_food', 'mfds_processed')
  AND (
    name ILIKE '%아임이%'
    OR name ILIKE '%아임e%'
  );

UPDATE public.foods
SET brand = '세븐셀렉트'
WHERE brand IS NULL
  AND source IN ('public_data_food', 'mfds_processed')
  AND (
    name ILIKE '%7-SELECT%'
    OR name ILIKE '%세븐셀렉트%'
    OR name ILIKE '%7-Eleven SELECT%'
  );

UPDATE public.foods
SET brand = '노브랜드'
WHERE brand IS NULL
  AND source IN ('public_data_food', 'mfds_processed')
  AND (
    name ILIKE '%노브랜드%'
    OR name ILIKE '%NoBrand%'
    OR name ILIKE '%NO BRAND%'
    OR name ILIKE '%노 브랜드%'
  );

CREATE OR REPLACE FUNCTION public.match_food_with_aliases(
  p_query text,
  p_limit integer DEFAULT 5,
  p_min_similarity real DEFAULT 0.3
)
RETURNS TABLE(
  food_id uuid,
  name text,
  category text,
  calories numeric,
  protein numeric,
  carbs numeric,
  fat numeric,
  serving_grams integer,
  brand text,
  matched_via text,
  similarity real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH q AS (
    SELECT lower(trim(p_query)) AS qn
  ),
  name_hits AS (
    SELECT
      f.id,
      f.name,
      f.category,
      f.calories,
      f.protein,
      f.carbs,
      f.fat,
      f.serving_grams,
      f.brand,
      'name'::text AS matched_via,
      similarity(f.name_normalized, q.qn) AS raw_sim
    FROM public.foods f, q
    WHERE f.name_normalized % q.qn
  ),
  alias_hits AS (
    SELECT
      f.id,
      f.name,
      f.category,
      f.calories,
      f.protein,
      f.carbs,
      f.fat,
      f.serving_grams,
      f.brand,
      'alias'::text AS matched_via,
      similarity(a.alias_normalized, q.qn) AS raw_sim
    FROM public.food_aliases a
    JOIN public.foods f ON f.id = a.food_id, q
    WHERE a.alias_normalized % q.qn
  ),
  merged AS (
    SELECT * FROM name_hits
    UNION ALL
    SELECT * FROM alias_hits
  ),
  scored AS (
    SELECT
      m.*,
      LEAST(
        1.0,
        GREATEST(
          0.0,
          m.raw_sim +
          CASE
            WHEN q.qn ~ '(heyroo|헤이루)' AND m.brand = '헤이루'
              THEN 0.35
            WHEN q.qn ~ '(heyroo|헤이루)' AND m.brand = 'CU 득템'
              THEN -0.10
            WHEN q.qn LIKE '%득템%'
                 AND q.qn !~ '(heyroo|헤이루)'
                 AND m.brand = 'CU 득템'
              THEN 0.20
            WHEN q.qn ~ '(youus|you us|유어스)' AND m.brand = '유어스'
              THEN 0.25
            WHEN q.qn ~ '(7-select|7 eleven select|세븐셀렉트)' AND m.brand = '세븐셀렉트'
              THEN 0.25
            WHEN q.qn ~ '(nobrand|no brand|노브랜드|노 브랜드)' AND m.brand = '노브랜드'
              THEN 0.40
            WHEN q.qn ~ '(아임e|아임이)' AND m.brand = '아임e'
              THEN 0.25
            ELSE 0
          END
        )
      )::real AS sim
    FROM merged m, q
  ),
  filtered AS (
    SELECT *
    FROM scored
    WHERE sim >= p_min_similarity
  ),
  best_per_id AS (
    SELECT DISTINCT ON (id)
      id, name, category, calories, protein, carbs, fat,
      serving_grams, brand, matched_via, sim
    FROM filtered
    ORDER BY id, sim DESC, matched_via
  ),
  deduped AS (
    SELECT DISTINCT ON (
      brand,
      name,
      calories,
      protein,
      carbs,
      fat,
      serving_grams
    )
      id, name, category, calories, protein, carbs, fat,
      serving_grams, brand, matched_via, sim
    FROM best_per_id
    ORDER BY
      brand,
      name,
      calories,
      protein,
      carbs,
      fat,
      serving_grams,
      sim DESC,
      id
  )
  SELECT
    id,
    name,
    category,
    calories,
    protein,
    carbs,
    fat,
    serving_grams,
    brand,
    matched_via,
    sim
  FROM deduped
  ORDER BY sim DESC, name
  LIMIT p_limit;
$function$;

GRANT EXECUTE ON FUNCTION public.match_food_with_aliases(text, integer, real) TO anon, authenticated;

-- ============================================================
-- 끝
-- ============================================================
