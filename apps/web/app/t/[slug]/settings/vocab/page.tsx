import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { InlineGuide } from '@/components/inline-guide';
import { NewVocabForm } from './new-vocab-form';
import { DeleteButton } from './delete-button';

export const dynamic = 'force-dynamic';

type VocabRow = {
  id: string;
  term: string;
  term_type: 'brand' | 'doctor' | 'service' | 'location_alias' | 'competitor';
  aliases: string[];
  created_at: string;
};

const GROUPS: Array<{ type: VocabRow['term_type']; label: string; hint: string }> = [
  { type: 'brand', label: '本品牌', hint: '识别答案里提到自己的关键词' },
  { type: 'doctor', label: '医生', hint: '答案里出现医生名 = 命中本品牌' },
  { type: 'service', label: '服务', hint: '辅助标记意图,V2 可用作话题分类' },
  { type: 'location_alias', label: '城市', hint: '本地推荐类问题用得上' },
  { type: 'competitor', label: '竞品', hint: '答案里出现 → SOV 分母 +1' },
];

export default async function VocabPage({ params }: { params: { slug: string } }) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator']);
  const supabase = createSupabaseServerClient();

  const { data: rowsRaw } = await supabase
    .from('brand_vocab')
    .select('id, term, term_type, aliases, created_at')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('term_type', { ascending: true })
    .order('created_at', { ascending: true });

  const rows = (rowsRaw ?? []) as VocabRow[];
  const byType = new Map<string, VocabRow[]>();
  for (const r of rows) {
    const list = byType.get(r.term_type) ?? [];
    list.push(r);
    byType.set(r.term_type, list);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="品牌词典"
        subtitle={`${rows.length} 条词条 · GEO 追踪用这本词典在豆包答案里做命中识别`}
        actions={
          <div className="flex items-center gap-2">
            <NewVocabForm tenantSlug={tenant.slug} />
            <Link
              href={`/t/${tenant.slug}/settings`}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              ← 返回设置
            </Link>
          </div>
        }
      />

      <InlineGuide
        storageKey={`guide:vocab:${tenant.slug}`}
        title="品牌词典 = GEO 追踪的「眼睛」"
        body="豆包答案是纯文本,我们用关键词匹配判断「这条答案有没有提到你」「有没有提到竞品」。词典越完整,SOV 数字越准。最少要把:本品牌主名 + 主诊医师 + 6 个最直接的同城竞品 录入。"
        steps={[
          '主名要规范化(医院全称),aliases 放简称 / 别名 / 常见误写',
          '医生名加上职称(贾医生 / 贾大夫)能多命中',
          '每月加 1-2 条新竞品,GEO 数据会越来越准',
        ]}
      />

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          词典是空的。点右上角「+ 新建词条」开始,或运行 <code>pnpm -F @geo/db dev-seed-w6</code> 导入种子。
        </div>
      ) : (
        <div className="space-y-6">
          {GROUPS.map((g) => {
            const list = byType.get(g.type) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={g.type} className="card-surface">
                <header className="flex items-baseline justify-between border-b border-border px-5 py-3">
                  <div>
                    <h2 className="text-sm font-semibold">
                      {g.label}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {list.length} 条
                      </span>
                    </h2>
                    <p className="text-[11px] text-muted-foreground">{g.hint}</p>
                  </div>
                </header>
                <ul className="divide-y divide-border">
                  {list.map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-medium">{r.term}</p>
                        {r.aliases.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {r.aliases.map((a, i) => (
                              <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                {a}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">没有别名</p>
                        )}
                      </div>
                      <DeleteButton tenantSlug={tenant.slug} vocabId={r.id} term={r.term} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
