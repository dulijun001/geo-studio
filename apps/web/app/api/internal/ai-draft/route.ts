/**
 * Internal AI-draft API — invoked by the worker's content.batch_draft_item job.
 *
 * Auth: `x-internal-secret` header must equal env DRAFT_INTERNAL_SECRET.
 * The worker runs in the same trust boundary (same DATABASE_URL, same
 * machine in self-hosted setups), so a shared secret is sufficient and we
 * don't need OAuth / signed JWTs here.
 *
 * Why this route exists rather than worker importing core directly:
 *   apps/worker can only depend on `packages/*` (workspace rule). The AI-draft
 *   core lives in apps/web/lib/ai-draft-core.ts because it depends on the
 *   web's @supabase/supabase-js version + KB filesystem layout. So worker hits
 *   web over HTTP to reuse the same code path. Localhost overhead is < 1ms.
 *
 * Returns: { content_item_id, cited_paths } on success;
 *          { error: string } on failure (404/422/500).
 */
import { NextResponse } from 'next/server';
import { runAiDraft, type RunAiDraftInput } from '@/lib/ai-draft-core';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — LLM can take 60-180s

type Body = RunAiDraftInput & { tenant_id: string };

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.DRAFT_INTERNAL_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'DRAFT_INTERNAL_SECRET not configured on server' },
      { status: 500 },
    );
  }
  const provided = req.headers.get('x-internal-secret');
  if (!provided || provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.tenant_id || !body.topic || !body.audience || !body.platform) {
    return NextResponse.json(
      { error: 'tenant_id, topic, audience, platform required' },
      { status: 422 },
    );
  }

  try {
    const supabase = getSupabaseServiceClient();
    const result = await runAiDraft(supabase, body.tenant_id, {
      topic: body.topic,
      audience: body.audience,
      platform: body.platform,
      writing_template_id: body.writing_template_id ?? null,
      keyword_ids: body.keyword_ids ?? [],
      preferred_doc_paths: body.preferred_doc_paths ?? [],
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[/api/internal/ai-draft] failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
