-- 기존 Supabase 프로젝트에 관리자가 별도로 적용할 준비용 SQL입니다.
-- 기존 메모 및 소유자는 변경하지 않으며 강사 역할은 관리자만 부여합니다.
CREATE TABLE IF NOT EXISTS public.resource_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  role text NOT NULL CHECK (role = 'instructor')
);
ALTER TABLE public.resource_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resource_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_roles TO service_role;

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id)
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.announcements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO service_role;
-- 공지도 서버 API를 통해서만 읽고 쓰도록 기본 거부합니다.
