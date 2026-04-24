'use server';

import PgBoss from 'pg-boss';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/tenant';

const ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/pdf',
  'text/markdown',
  'text/plain',
]);

const EXT_BY_MIME: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/pdf': 'pdf',
  'text/markdown': 'md',
  'text/plain': 'txt',
};

const SOURCE_TYPE_BY_MIME: Record<string, 'word' | 'pdf' | 'manual'> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/msword': 'word',
  'application/pdf': 'pdf',
  'text/markdown': 'manual',
  'text/plain': 'manual',
};

export type CreateUploadSlotResult = {
  content_item_id: string;
  storage_path: string;
  signed_upload: { token: string; path: string };
};

/**
 * Step 1 of upload. Creates the content_items row and returns a signed URL
 * the browser can POST the file to. Enqueue happens after the upload completes
 * (see `enqueueParse` below) so a network failure mid-upload doesn't leave
 * a stuck job.
 */
export async function createUploadSlot(
  tenantSlug: string,
  input: { title: string; mime: string; filename: string },
): Promise<CreateUploadSlotResult> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  if (!ALLOWED_MIME.has(input.mime)) {
    throw new Error(`Unsupported file type: ${input.mime}`);
  }
  const title = input.title.trim() || input.filename;
  if (title.length === 0) throw new Error('Title required');

  const supabase = createSupabaseServerClient();
  const source_type = SOURCE_TYPE_BY_MIME[input.mime] ?? 'manual';

  const { data: inserted, error: insertErr } = await supabase
    .from('content_items')
    .insert({
      tenant_id: tenant.id,
      title,
      source_type,
      status: 'draft',
      markdown: '',
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    throw new Error(`Failed to create content item: ${insertErr?.message}`);
  }

  const ext = EXT_BY_MIME[input.mime] ?? 'bin';
  const path = `${tenant.id}/${inserted.id}.${ext}`;

  const { data: signed, error: signErr } = await supabase.storage
    .from('content-uploads')
    .createSignedUploadUrl(path);
  if (signErr || !signed) {
    // Roll back the content_items row so we don't litter drafts.
    await supabase.from('content_items').delete().eq('id', inserted.id);
    throw new Error(`Failed to create signed upload URL: ${signErr?.message}`);
  }

  // Record the intended storage_path upfront so the worker can find it later.
  await supabase
    .from('content_items')
    .update({ source_url: path })
    .eq('id', inserted.id);

  return {
    content_item_id: inserted.id,
    storage_path: path,
    signed_upload: { token: signed.token, path: signed.path },
  };
}

/**
 * Step 2: called after the client confirms the upload succeeded.
 * Enqueues the parse job; worker picks it up and fills in markdown + status.
 */
export async function enqueueParse(
  tenantSlug: string,
  content_item_id: string,
  mime: string,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);

  const supabase = createSupabaseServerClient();
  const { data: row, error } = await supabase
    .from('content_items')
    .select('id, tenant_id, source_url, status')
    .eq('id', content_item_id)
    .single();
  if (error || !row) throw new Error(`Content item not found: ${error?.message}`);
  if (row.tenant_id !== tenant.id) throw new Error('Tenant mismatch');
  if (!row.source_url) throw new Error('No storage path set');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');

  const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
  await boss.start();
  try {
    // pg-boss v10 requires queues to exist before send.
    await boss.createQueue('content.parse');
    await boss.send('content.parse', {
      content_item_id: row.id,
      tenant_id: row.tenant_id,
      storage_path: row.source_url,
      mime_type: mime,
    });
  } finally {
    await boss.stop({ graceful: true, timeout: 5000 });
  }
}
