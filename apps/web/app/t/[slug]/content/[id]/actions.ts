'use server';

import PgBoss from 'pg-boss';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const ALLOWED_PLATFORMS = [
  'toutiao_article',
  'douyin_script',
  'wechat_mp',
  'zhihu',
  'xiaohongshu',
  'baijiahao',
  'souhu',
] as const;
type Platform = (typeof ALLOWED_PLATFORMS)[number];

/**
 * Kick off variant generation for the given content item.
 * Server action: the actual LLM + insert work happens in the worker so the
 * request returns fast and we don't hit Vercel's 10s limit on cold generations.
 */
export async function enqueueVariantGenerate(
  tenantSlug: string,
  contentItemId: string,
  platforms: Platform[],
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);

  const validPlatforms = platforms.filter((p): p is Platform =>
    (ALLOWED_PLATFORMS as readonly string[]).includes(p),
  );
  if (validPlatforms.length === 0) {
    throw new Error('请至少选择一个目标平台。');
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  // Verify the content item belongs to this tenant and is actually parsed.
  const { data: item, error: iErr } = await supabase
    .from('content_items')
    .select('id, tenant_id, markdown, status')
    .eq('id', contentItemId)
    .single();
  if (iErr || !item) throw new Error(`Content item not found: ${iErr?.message}`);
  if (item.tenant_id !== tenant.id) throw new Error('Tenant mismatch');
  if (!item.markdown || item.markdown.trim().length < 20) {
    throw new Error('源内容过短或尚未解析完成,请先等待解析或检查上传的文件。');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');

  const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
  await boss.start();
  try {
    await boss.createQueue('content.variant_generate');
    await boss.send('content.variant_generate', {
      content_item_id: item.id,
      tenant_id: tenant.id,
      platforms: validPlatforms,
      triggered_by: user.id,
    });
  } finally {
    await boss.stop({ graceful: true, timeout: 5000 });
  }

  revalidatePath(`/t/${tenantSlug}/content/${contentItemId}`);
}
