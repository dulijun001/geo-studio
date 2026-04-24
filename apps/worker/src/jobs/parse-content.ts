import mammoth from 'mammoth';
// pdf-parse's default entry point loads a test file on import; bypass via lib path.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore no types for deep path
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { getServiceClient } from '../lib/supabase';

export type ParseContentJob = {
  content_item_id: string;
  tenant_id: string;
  storage_path: string; // e.g. "<tenant_id>/<content_item_id>.docx"
  mime_type: string;
};

export const BUCKET = 'content-uploads';

export async function handleParseContent(data: ParseContentJob): Promise<void> {
  const { content_item_id, storage_path, mime_type } = data;
  const client = getServiceClient();

  const started = Date.now();
  console.log(`[parse-content] ${content_item_id} mime=${mime_type} path=${storage_path}`);

  // 1. Download the uploaded file.
  const { data: file, error: dlErr } = await client.storage.from(BUCKET).download(storage_path);
  if (dlErr || !file) {
    await markFailed(content_item_id, `download: ${dlErr?.message ?? 'no file'}`);
    return;
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  // 2. Extract text by mime.
  let markdown: string;
  try {
    markdown = await extract(buffer, mime_type);
  } catch (err) {
    await markFailed(content_item_id, `parse: ${(err as Error).message}`);
    return;
  }

  // 3. Persist and flip status.
  const { error: updateErr } = await client
    .from('content_items')
    .update({ markdown, status: 'parsed' })
    .eq('id', content_item_id);
  if (updateErr) {
    await markFailed(content_item_id, `update: ${updateErr.message}`);
    return;
  }

  console.log(`[parse-content] ${content_item_id} done in ${Date.now() - started}ms`);
}

async function extract(buffer: Buffer, mime: string): Promise<string> {
  switch (mime) {
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/msword': {
      // extractRawText gives plain text — good enough for GEO rewriting (LLM doesn't need format).
      const { value } = await mammoth.extractRawText({ buffer });
      return value;
    }
    case 'application/pdf': {
      const result = await pdfParse(buffer);
      return result.text;
    }
    case 'text/markdown':
    case 'text/plain':
      return buffer.toString('utf-8');
    default:
      throw new Error(`unsupported mime: ${mime}`);
  }
}

async function markFailed(content_item_id: string, reason: string): Promise<void> {
  console.error(`[parse-content] ${content_item_id} failed: ${reason}`);
  const client = getServiceClient();
  // Keep status='draft' so UI can show an error state. No dedicated error column
  // in V1; stash reason in audit_logs so it's searchable and retained.
  await client.from('audit_logs').insert({
    tenant_id: await resolveTenantId(content_item_id),
    actor_user_id: null,
    action: 'content.parse_failed',
    target_type: 'content_item',
    target_id: content_item_id,
    payload: { reason },
  });
}

async function resolveTenantId(content_item_id: string): Promise<string | null> {
  const { data } = await getServiceClient()
    .from('content_items')
    .select('tenant_id')
    .eq('id', content_item_id)
    .maybeSingle();
  return data?.tenant_id ?? null;
}
