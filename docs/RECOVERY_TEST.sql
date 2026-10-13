-- 시험 전용 테이블만 준비합니다. public.memos와 운영 정책은 변경하지 않습니다.
-- 실제 적용과 비공개 사전 백업/승인 등록은 아직 실행하지 않았습니다.
CREATE TABLE IF NOT EXISTS public.recovery_test_memos (
  id text PRIMARY KEY, owner_id uuid NOT NULL REFERENCES auth.users(id), title text NOT NULL, body text NOT NULL,
  incident_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.recovery_test_backups (
  version text NOT NULL, id text NOT NULL, owner_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL, body text NOT NULL, captured_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(version, id)
);
-- 사본과 분리한 승인 기록. 사전 검증 시 관리자만 등록하고 복구 API에서는 변경하지 않습니다.
CREATE TABLE IF NOT EXISTS public.recovery_test_approvals (
  version text NOT NULL, id text NOT NULL, owner_id uuid NOT NULL REFERENCES auth.users(id),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(version, id)
);
CREATE TABLE IF NOT EXISTS public.recovery_test_audit (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL, id text NOT NULL, version text NOT NULL, previous_hash text NOT NULL, restored_hash text NOT NULL
);
ALTER TABLE public.recovery_test_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_test_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_test_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_test_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recovery_test_memos, public.recovery_test_backups,
  public.recovery_test_approvals, public.recovery_test_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.recovery_test_memos, public.recovery_test_backups,
  public.recovery_test_approvals, public.recovery_test_audit FROM service_role;
GRANT SELECT, UPDATE ON public.recovery_test_memos TO service_role;
GRANT SELECT ON public.recovery_test_backups, public.recovery_test_approvals TO service_role;
GRANT SELECT, INSERT ON public.recovery_test_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.recovery_test_audit_sequence_seq TO service_role;

-- Supabase 표준 extensions 스키마의 pgcrypto를 사용합니다. 설치 위치를 적용 전에 확인하세요.
CREATE OR REPLACE FUNCTION public.recovery_test_content_hash(p_title text, p_body text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog
AS $$ SELECT encode(extensions.digest(convert_to(
  octet_length(convert_to(p_title,'UTF8'))::text || ':' || p_title ||
  octet_length(convert_to(p_body,'UTF8'))::text || ':' || p_body, 'UTF8'), 'sha256'), 'hex') $$;

CREATE OR REPLACE FUNCTION public.recovery_test_state_hash(p_id text,p_owner text,p_title text,p_body text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog
AS $$ SELECT encode(extensions.digest(convert_to(
  octet_length(convert_to(p_id,'UTF8'))::text || ':' || p_id ||
  octet_length(convert_to(p_owner,'UTF8'))::text || ':' || p_owner ||
  '64:' || public.recovery_test_content_hash(p_title,p_body),'UTF8'),'sha256'),'hex') $$;

CREATE OR REPLACE FUNCTION public.recovery_test_memo(p_id text, p_version text, p_owner uuid,
  p_apply boolean DEFAULT false, p_expected_current text DEFAULT NULL, p_expected_backup text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
AS $$
DECLARE
  b public.recovery_test_backups%ROWTYPE;
  a public.recovery_test_approvals%ROWTYPE;
  m public.recovery_test_memos%ROWTYPE;
  backup_hash text; current_hash text; restored_hash text;
BEGIN
  SELECT * INTO b FROM public.recovery_test_backups WHERE id=p_id AND version=p_version FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'backup_missing'; END IF;
  SELECT * INTO a FROM public.recovery_test_approvals WHERE id=p_id AND version=p_version FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'backup_missing'; END IF;
  backup_hash := public.recovery_test_content_hash(b.title, b.body);
  IF b.id<>a.id OR b.owner_id<>a.owner_id OR b.version<>a.version OR backup_hash<>a.content_hash THEN
    RAISE EXCEPTION 'backup_verification_failed';
  END IF;
  IF b.owner_id<>p_owner THEN RAISE EXCEPTION 'resource_not_found'; END IF;
  -- 권한 근거는 손상된 현재 행이 아니라 사전 승인된 B 사본입니다.
  SELECT * INTO m FROM public.recovery_test_memos WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found'; END IF;
  IF m.incident_at IS NULL OR b.captured_at > a.approved_at OR a.approved_at >= m.incident_at THEN
    RAISE EXCEPTION 'backup_verification_failed';
  END IF;
  current_hash := public.recovery_test_state_hash(m.id,m.owner_id::text,m.title,m.body);
  IF p_apply IS DISTINCT FROM true THEN RETURN jsonb_build_object('id',p_id,'ownerId',p_owner,'version',p_version,
    'expectedCurrentHash',current_hash,'expectedBackupHash',backup_hash); END IF;
  IF p_expected_current IS DISTINCT FROM current_hash OR p_expected_backup IS DISTINCT FROM backup_hash THEN
    RAISE EXCEPTION 'preview_confirmation_required';
  END IF;
  UPDATE public.recovery_test_memos SET owner_id=b.owner_id,title=b.title, body=b.body WHERE id=p_id;
  SELECT public.recovery_test_content_hash(title,body) INTO restored_hash FROM public.recovery_test_memos
    WHERE id=p_id AND owner_id=p_owner;
  IF restored_hash IS DISTINCT FROM backup_hash THEN RAISE EXCEPTION 'restore_verification_failed'; END IF;
  INSERT INTO public.recovery_test_audit(action,id,version,previous_hash,restored_hash)
    VALUES('restore_test_memo',p_id,p_version,current_hash,restored_hash);
  RETURN jsonb_build_object('id',p_id,'ownerId',p_owner,'version',p_version,'contentHash',restored_hash);
END $$;
REVOKE ALL ON FUNCTION public.recovery_test_content_hash(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recovery_test_state_hash(text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recovery_test_memo(text,text,uuid,boolean,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recovery_test_content_hash(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recovery_test_state_hash(text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recovery_test_memo(text,text,uuid,boolean,text,text) TO service_role;
