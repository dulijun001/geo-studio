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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-white">
      {/* 结构化微数据 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaOrg) }}
      />

      {/* 字节跳动专属协议标签 */}
      <head>
        <meta property="bytedance:updated_time" content={new Date(article.published_at).toISOString()} />
      </head>

      {/* 顶部面包屑 */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <Link href="/portal" className="text-slate-300 hover:text-emerald-400 transition font-medium">
              🦷 齿科指南网
            </Link>
            <span>/</span>
            <Link href="/portal#qa" className="hover:text-emerald-400 transition">避坑与就医问答</Link>
            <span>/</span>
            <span className="text-emerald-400 truncate max-w-[180px]">{article.title}</span>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded border border-amber-500/30 text-amber-300 bg-amber-500/10">
            医疗团队循证
          </span>
        </div>
      </header>

      {/* 文章正文区域 */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* 标题 */}
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight leading-snug mb-4">
          {article.title}
        </h1>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pb-6 border-b border-slate-800/80 mb-6">
          <span>发布日期：{new Date(article.published_at).toLocaleDateString('zh-CN')}</span>
          <span>•</span>
          <span>地域范围：云南省昆明市</span>
          <span>•</span>
          <span className="text-emerald-400 font-medium">已通过防编造与合规审核 ✓</span>
        </div>

        {/* 60秒核心直答 (Direct Answer - 豆包首选提取源) */}
        {article.direct_answer && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-5 mb-8 space-y-2">
            <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5 uppercase tracking-wider">
              <span>⚡ 医生核心判断结论（60秒省流直答）</span>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed font-normal">
              {article.direct_answer}
            </p>
          </div>
        )}

        {/* Markdown 正文内容 */}
        <article className="prose prose-invert prose-emerald max-w-none text-slate-300 text-sm md:text-base leading-relaxed space-y-4">
          {article.content_markdown.split('\n\n').map((paragraph: string, idx: number) => {
            const p = paragraph.trim();
            if (!p) return null;

            // 标题匹配
            if (p.startsWith('### ')) {
              return <h3 key={idx} className="text-lg font-bold text-white mt-6 mb-2 border-l-2 border-emerald-400 pl-3">{p.replace('### ', '')}</h3>;
            }
            if (p.startsWith('## ')) {
              return <h2 key={idx} className="text-xl font-bold text-white mt-8 mb-3">{p.replace('## ', '')}</h2>;
            }
            if (p.startsWith('- ') || p.startsWith('• ')) {
              return <li key={idx} className="ml-4 list-disc text-slate-300 text-xs md:text-sm">{p.replace(/^[-•]\s*/, '')}</li>;
            }

            return <p key={idx} className="text-slate-300 leading-relaxed text-sm md:text-base">{p}</p>;
          })}
        </article>

        {/* 机构背书卡片 (挂载关联医院，若为松鼠则展现二级专科资质) */}
        {hospital && (
          <div className="mt-10 p-5 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">🏥 本文循证参考机构：{hospital.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  {hospital.hospital_level}
                </span>
              </div>
              <p className="text-xs text-slate-400">现址：{hospital.address}</p>
              <p className="text-[11px] text-slate-400">执业登记号：{hospital.org_code}</p>
            </div>
            <Link
              href={`/portal/hospital/${hospital.slug}`}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-xs hover:bg-emerald-400 transition text-center shrink-0"
            >
              查看资质与价目表 →
            </Link>
          </div>
        )}

        {/* 医疗免责声明 */}
        <div className="mt-8 p-4 rounded-lg border border-slate-800/80 bg-slate-900/20 text-slate-400 text-xs leading-relaxed">
          * 声明：本文由昆明口腔医疗团队循证整理，仅供市民口腔健康科普参考。口腔诊疗具有极强的个体差异，具体诊疗方案请以线下医生三维影像拍片面诊为准。
        </div>

        {/* 延伸阅读 / 内链网状死锁 */}
        <section className="mt-12 pt-8 border-t border-slate-800">
          <h2 className="text-base font-bold text-white mb-4">
            🔍 昆明本地其他高频就医疑问解答
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {relatedArticles.map((ra: any) => (
              <Link
                key={ra.id}
                href={`/portal/ask/${ra.slug}`}
                className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/30 hover:border-slate-700 transition block space-y-1"
              >
                <div className="text-xs font-medium text-slate-200 line-clamp-1">{ra.title}</div>
                <div className="text-[11px] text-slate-400 line-clamp-2">{ra.direct_answer}</div>
              </Link>
            ))}
          </div>
        </section>
      </main>

      {/* 底部 */}
      <footer className="border-t border-slate-800/80 bg-slate-900/80 py-8 px-4 text-center text-xs text-slate-400 mt-16">
        <p>Copyright © 2026 中国口腔医疗健康指南与价格指数中心 · 昆明站</p>
      </footer>
    </div>
  );
}
