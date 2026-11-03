import { getServiceClient } from './supabase';

/**
 * 将通过 DoD 门禁且审核通过的高分变体自动同步到 Portal 门户长文表
 * 实现门户自生长飞轮，0 人工搬砖
 */
export async function syncVariantToPortal(variantId: string): Promise<boolean> {
  const client = getServiceClient();

  const { data: v, error: vErr } = await client
    .from('content_variants')
    .select(`
      id,
      tenant_id,
      title,
      body,
      created_at,
      status,
      dod_status
    `)
    .eq('id', variantId)
    .single();

  if (vErr || !v || !v.body || v.body.length < 200) {
    return false;
  }

  // 获取松鼠口腔与昆明西山区的主键映射
  const [{ data: hosp }, { data: reg }] = await Promise.all([
    client.from('portal_hospitals').select('id').eq('slug', 'km-songshu').single(),
    client.from('portal_regions').select('id').eq('code', '530112').single(),
  ]);

  const slug = `guide-${v.id.slice(0, 8)}`;
  const directAns = v.body.split('\n\n')[0]?.replace(/^[#>\s]+/, '').slice(0, 160) || '';

  const schemaOrg = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: v.title,
        acceptedAnswer: {
          '@type': 'Answer',
          text: directAns,
        },
      },
    ],
  };

  const { error: insErr } = await client
    .from('portal_articles')
    .upsert(
      {
        tenant_id: v.tenant_id,
        source_variant_id: v.id,
        title: v.title,
        slug,
        direct_answer: directAns,
        content_markdown: v.body,
        target_hospital_id: hosp?.id || null,
        target_region_id: reg?.id || null,
        schema_org: schemaOrg,
        status: 'published',
        published_at: v.created_at || new Date().toISOString(),
      },
      { onConflict: 'slug' }
    );

  if (insErr) {
    console.error('[portal-sync] syncVariantToPortal error:', insErr.message);
    return false;
  }

  return true;
}
