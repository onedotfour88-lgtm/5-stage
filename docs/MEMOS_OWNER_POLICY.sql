-- 8단계: 실제 DB에서 확인한 기존 전체 허용 정책의 최소 수정 기록입니다.
-- 2026-10-13 Supabase Policies 화면에서 동일한 USING/WITH CHECK를 저장했습니다.
-- 기존 메모 내용과 owner_id, 다른 테이블·정책·권한은 변경하지 않습니다.
-- 이 정책은 SELECT/INSERT/UPDATE/DELETE에 소유자 일치를 요구합니다.
-- service_role은 RLS를 우회하므로 최종 API의 소유자 검사는 계속 필요합니다.
ALTER POLICY "Allow all access to memos"
ON public.memos
USING ((SELECT auth.uid())::text = owner_id::text)
WITH CHECK ((SELECT auth.uid())::text = owner_id::text);
