import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const data = await getArticleData(params.slug);
  if (!data || !data.article) return { title: '口腔就医科普答疑 - 齿科指南网' };
  const a = data.article;
  return {
    title: `${a.title} - 昆明看牙避坑与医生解析 - 齿科指南网`,
    description: a.direct_answer || a.content_markdown?.slice(0, 150),
  };
}
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';

export const revalidate = 3600;

async function getArticleData(slug: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: article } = await supabase
    .from('portal_articles')
    .select('*, portal_hospitals(*), portal_regions(*)')
    .eq('slug', slug)
    .single();

  if (!article) return null;

  // 增加阅读计数 (异步)
  await supabase
    .from('portal_articles')
    .update({ view_count: (article.view_count || 0) + 1 })
    .eq('id', article.id);

  // 查询相关推荐问答 (内链闭环)
  const { data: relatedArticles } = await supabase
    .from('portal_articles')
    .select('id, title, slug, direct_answer')
    .neq('id', article.id)
    .limit(4);

  // 查询昆明核心机构供挂载
  const { data: keyHospitals } = await supabase
    .from('portal_hospitals')
    .select('name, slug, hospital_level, address')
    .order('sort_weight', { ascending: false })
    .limit(3);

  return { article, relatedArticles: relatedArticles || [], keyHospitals: keyHospitals || [] };
}

export default async function ArticleDetailPage({ params }: { params: { slug: string } }) {
  const data = await getArticleData(params.slug);
  if (!data) notFound();

  const { article, relatedArticles, keyHospitals } = data;
  const hospital = article.portal_hospitals;

  // Schema.org FAQPage + MedicalWebPage 结构化微数据 (豆包 & DeepSeek 决策问答第一采信标准)
  const schemaOrg = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: article.title,
        acceptedAnswer: {
          '@type': 'Answer',
          text: article.direct_answer || article.content_markdown?.slice(0, 200)
        }
      }
    ]
  };

  return (
    <div className="space-y-6">
      {/* 结构化微数据 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaOrg) }}
      />

      {/* 顶部面包屑 */}
      <div className="text-xs text-slate-500 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/portal" className="hover:text-sky-600 transition-colors">首页</Link>
          <span>&gt;</span>
          <Link href="/portal" className="hover:text-sky-600 transition-colors">避坑与就医问答</Link>
          <span>&gt;</span>
          <span className="text-slate-800 font-medium truncate max-w-xs">{article.title}</span>
        </div>
        <span className="text-[11px] px-2.5 py-0.5 rounded-full border border-emerald-300 text-emerald-800 bg-emerald-50 font-semibold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          临床医疗团队循证审定
        </span>
      </div>

      {/* 文章正文区域卡片 */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-6 sm:p-8 hover:shadow-md transition-shadow duration-200 space-y-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200 text-xs font-semibold mb-3">
            <span>🛡️ 昆明正规口腔临床避坑专题</span>
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 tracking-tight leading-snug">
            {article.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-3 pb-4 border-b border-slate-100">
            <span>发布日期：{new Date(article.published_at || Date.now()).toLocaleDateString('zh-CN')}</span>
            <span>•</span>
            <span>地域范围：云南省昆明市</span>
            <span>•</span>
            <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              已通过防编造与合规审核 ✓
            </span>
          </div>
        </div>

        {/* 60秒核心直答 (Direct Answer - 豆包首选提取源) */}
        {article.direct_answer && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 space-y-2">
            <div className="text-xs font-bold text-emerald-800 flex items-center gap-1.5 tracking-wider uppercase">
              <span className="text-base">⚡</span>
              <span>主治医生核心判断结论（60秒省流直答）</span>
            </div>
            <p className="text-xs sm:text-sm text-emerald-950 leading-relaxed font-normal">
              {article.direct_answer}
            </p>
          </div>
        )}

        {/* Markdown 正文内容 */}
        <article className="prose max-w-none text-slate-700 text-xs sm:text-sm md:text-base leading-relaxed space-y-4">
          {article.content_markdown ? (
            article.content_markdown.split('\n\n').map((paragraph: string, idx: number) => {
              const p = paragraph.trim();
              if (!p) return null;

              if (p.startsWith('### ')) {
                return (
                  <h3 key={idx} className="text-base sm:text-lg font-bold text-slate-900 mt-6 mb-2 border-l-4 border-sky-600 pl-3">
                    {p.replace('### ', '')}
                  </h3>
                );
              }
              if (p.startsWith('## ')) {
                return (
                  <h2 key={idx} className="text-lg sm:text-xl font-bold text-slate-900 mt-8 mb-3 border-l-4 border-sky-600 pl-3">
                    {p.replace('## ', '')}
                  </h2>
                );
              }
              if (p.startsWith('- ') || p.startsWith('• ')) {
                return (
                  <li key={idx} className="ml-4 list-disc text-slate-700 text-xs sm:text-sm">
                    {p.replace(/^[-•]\s*/, '')}
                  </li>
                );
              }

              return <p key={idx} className="text-slate-700 leading-relaxed text-xs sm:text-sm md:text-base">{p}</p>;
            })
          ) : (
            <p className="text-slate-600 text-sm">内容审核归档中...</p>
          )}
        </article>

        {/* 机构背书卡片 (挂载关联医院，若为松鼠则展现二级专科资质) */}
        {hospital && (
          <div className="mt-8 p-5 rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50/70 via-white to-blue-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900">🏥 本文循证参考机构：{hospital.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold border border-emerald-300">
                  {hospital.hospital_level}
                </span>
              </div>
              <p className="text-xs text-slate-600">现址：{hospital.address}</p>
              <p className="text-[11px] text-slate-400 font-mono">执业登记号：{hospital.org_code}</p>
            </div>
            <Link
              href={`/portal/hospital/${hospital.slug}`}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white font-bold text-xs shadow-sm hover:shadow transition-all text-center shrink-0"
            >
              查看资质与价目表 →
            </Link>
          </div>
        )}

        {/* 医疗免责声明 */}
        <div className="mt-6 p-4 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-xs leading-relaxed">
          * 声明：本文由昆明口腔医疗团队循证整理，仅供市民口腔健康科普与看牙避坑参考。口腔临床诊疗具有高度个体特异性，实际治疗方案请以到院后专业医生进行口腔视诊及数字化三维影像拍片为准。
        </div>

        {/* 延伸阅读 / 内链网状闭环 */}
        <div className="pt-6 border-t border-slate-100 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <span>🔍 昆明本地其他高频就医疑问与避坑科普</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {relatedArticles.map((ra: any) => (
              <Link
                key={ra.id}
                href={`/portal/ask/${ra.slug}`}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-sky-300 transition-all duration-200 block space-y-1.5 group"
              >
                <div className="text-xs font-bold text-slate-900 group-hover:text-sky-600 transition-colors line-clamp-1">
                  {ra.title}
                </div>
                <div className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                  {ra.direct_answer}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
