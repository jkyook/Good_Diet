-- ============================================================
-- T-055 meal_history 누락 분석 필드 보강
-- 분석 직후엔 메모리에 있으나 supabase save/load 라운드트립 후 사라지던 9개 필드.
-- idempotent: 모두 IF NOT EXISTS, jsonb는 null 허용
-- 실행: Supabase Dashboard → SQL Editor → 본 파일 통째로 붙여넣고 Run
-- ============================================================

ALTER TABLE meal_history
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS cooking_method text,
  ADD COLUMN IF NOT EXISTS sauce text,
  ADD COLUMN IF NOT EXISTS weight_grams int4,
  ADD COLUMN IF NOT EXISTS is_ambiguous boolean,
  ADD COLUMN IF NOT EXISTS candidates jsonb,
  ADD COLUMN IF NOT EXISTS ingredients jsonb,         -- T-005 v2 §재료별 분석
  ADD COLUMN IF NOT EXISTS portion_estimate jsonb,    -- §양 산출
  ADD COLUMN IF NOT EXISTS totals jsonb,              -- §영양 총합
  ADD COLUMN IF NOT EXISTS meal_score jsonb,          -- §균형 평가
  ADD COLUMN IF NOT EXISTS improvements jsonb,        -- string[]
  ADD COLUMN IF NOT EXISTS warnings jsonb,            -- string[]
  ADD COLUMN IF NOT EXISTS detected_foods jsonb,      -- string[]
  ADD COLUMN IF NOT EXISTS confidence text,           -- '높음' | '중간' | '낮음'
  ADD COLUMN IF NOT EXISTS recommendations jsonb;     -- T-039b 옵션

-- 기존 레코드는 컬럼 null. 신규 저장부터 채워짐.
-- ============================================================
