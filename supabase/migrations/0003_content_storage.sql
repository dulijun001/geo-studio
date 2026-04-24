-- ============================================================================
-- 0003_content_storage.sql
-- Private Storage bucket 'content-uploads' for Word/PDF source documents.
-- Path convention: <tenant_id>/<content_item_id>.<ext>
-- First path segment is the tenant_id, enforced by RLS.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-uploads',
  'content-uploads',
  false,
  52428800, -- 50 MB
  ARRAY[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', -- .docx
    'application/msword',                                                      -- .doc (legacy)
    'application/pdf',                                                         -- .pdf
    'text/markdown',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public = EXCLUDED.public;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- RLS on storage.objects scoped to content-uploads.
-- The first folder segment must be a UUID that the user belongs to.
-- If the cast fails (non-UUID segment), the policy silently denies (safe default).
-- ----------------------------------------------------------------------------

-- SELECT (download)
CREATE POLICY "content_uploads_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'content-uploads'
    AND (
      SELECT (storage.foldername(name))[1]::uuid
    ) IN (SELECT public.current_user_tenant_ids())
  );--> statement-breakpoint

-- INSERT (upload)
CREATE POLICY "content_uploads_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'content-uploads'
    AND (
      SELECT (storage.foldername(name))[1]::uuid
    ) IN (SELECT public.current_user_tenant_ids())
  );--> statement-breakpoint

-- UPDATE (rare, e.g. re-upload / metadata edit)
CREATE POLICY "content_uploads_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'content-uploads'
    AND (
      SELECT (storage.foldername(name))[1]::uuid
    ) IN (SELECT public.current_user_tenant_ids())
  );--> statement-breakpoint

-- DELETE (cleanup after content_items.deleted_at set)
CREATE POLICY "content_uploads_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'content-uploads'
    AND (
      SELECT (storage.foldername(name))[1]::uuid
    ) IN (SELECT public.current_user_tenant_ids())
  );
