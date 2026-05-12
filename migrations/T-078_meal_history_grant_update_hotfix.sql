-- ============================================================
-- T-078 meal_history UPDATE GRANT 복원 hotfix
-- 원인: T-055_meal_edit.sql line 30 `REVOKE UPDATE FROM authenticated`가
--       PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` (= Supabase upsert)의
--       UPDATE 권한 요구를 깨트림. saveMeal upsert가 신규 INSERT 케이스에도
--       42501 "permission denied for table meal_history" 반환.
-- 증상: T-055d 이후 머먹지 신규 분석 데이터가 모두 silently 저장 실패.
--       App.tsx saveMeal 에러 무시 → UI는 "분석 완료" 토스트, DB는 미저장.
--       새로고침 시 신규 행 사라짐.
-- 해결: table-level UPDATE 권한을 authenticated에 다시 GRANT.
--       T-055 의도였던 column-level 제한(meal_type, analyzed_at만)은 일시 무력화.
--       RLS UPDATE policy (user_id = auth.uid())로 행 단위 보호는 유지.
-- 후속: T-079에서 saveMeal을 `.insert()` 또는 `.upsert(..., {ignoreDuplicates: true})`
--       로 변경 후 REVOKE UPDATE 재적용 → T-055 의도 복원 예정.
-- 실행: Supabase Dashboard → SQL Editor → 본 파일 통째로 붙여넣고 Run
-- 의존: T-055_meal_edit.sql (REVOKE 적용 완료된 상태 전제)
-- 사용자: 2026-05-12 직접 실행 완료
-- ============================================================

GRANT UPDATE ON public.meal_history TO authenticated;

-- 검증
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
-- WHERE table_schema='public' AND table_name='meal_history' AND grantee='authenticated';
-- → UPDATE 포함되어야 함

-- ============================================================
-- 끝
-- ============================================================
