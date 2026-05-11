-- ============================================================
-- T-067 meal_history 확장 — 인분 + 후식 MealType (idempotent)
-- 1) meal_history에 portion_count 컬럼 추가 (기본 1)
-- 2) meal_type CHECK 제약 갱신 — 'dessert' 추가
-- 실행: Supabase Dashboard → SQL Editor → 본 파일 통째로 붙여넣고 Run
-- ============================================================

-- 1. 인분 메타데이터 (분석 결과 자체 환산 X — 참고 표시용)
ALTER TABLE public.meal_history
  ADD COLUMN IF NOT EXISTS portion_count int4 NOT NULL DEFAULT 1
    CHECK (portion_count >= 1 AND portion_count <= 99);

-- 2. meal_type CHECK 제약 — 'dessert' 추가
-- T-055 마이그레이션에서 만든 제약 DROP 후 재생성
ALTER TABLE public.meal_history
  DROP CONSTRAINT IF EXISTS meal_history_meal_type_check;
ALTER TABLE public.meal_history
  ADD CONSTRAINT meal_history_meal_type_check
  CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'dessert'));

-- ============================================================
-- 끝
-- ============================================================
