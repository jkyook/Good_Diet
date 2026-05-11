-- ============================================================
-- T-072 meal_history에 DB 매칭 영속화 컬럼 (idempotent)
-- 분석 직후 dbMatch가 selectedMeal에만 첨부되고 supabase 라운드트립 후 사라짐.
-- food_id + similarity를 컬럼으로 저장 → history 카드 풀 상세 진입 시에도 매칭 사실 보존.
--
-- 실행: Supabase Dashboard → SQL Editor → 본 파일 통째로 붙여넣고 Run
-- 의존: T-069_foods_schema.sql 선실행 (public.foods 테이블 존재)
-- ============================================================

ALTER TABLE public.meal_history
  ADD COLUMN IF NOT EXISTS matched_food_id uuid
    REFERENCES public.foods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS match_similarity numeric;

-- FK 인덱스 (foods 조회 시 JOIN 가속)
CREATE INDEX IF NOT EXISTS idx_meal_history_matched_food
  ON public.meal_history(matched_food_id)
  WHERE matched_food_id IS NOT NULL;

-- 컬럼 단위 GRANT — T-055d의 REVOKE ALL ON public.meal_history FROM anon, authenticated 패턴 호환.
-- meal_type, analyzed_at은 이미 GRANT됨. matched_food_id/match_similarity는 분석 결과로만 채워지므로
-- 클라 직접 UPDATE 권한 부여 X (service_role만 채움 = saveMeal 경로).
-- 단 saveMeal은 supabase anon 클라이언트로 upsert → INSERT 권한 별도. 기존 INSERT policy/권한 그대로 사용.

-- ============================================================
-- 끝
-- ============================================================
