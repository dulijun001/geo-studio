import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';

export const revalidate = 3600;

const CATEGORY_NAMES: Record<string, string> = {
  implant: '口腔种植牙',
  orthodontics: '牙齿矫正',
  restore: '补牙修复',
  extraction: '拔牙与智齿',
  pediatrics: '儿童齿科',
  periodontics: '牙周治疗',
  cosmetic: '牙齿美白与贴面'
};

async function getCategoryPriceData(category: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. 查询该分类基准价格指数
  const { data: priceIndexes } = await supabase
    .from('portal_price_indexes')
    .select('*')
    .eq('category', category)
    .order('sort_weight', { ascending: false });

  if (!priceIndexes || priceIndexes.length === 0) return null;

  // 2. 查询昆明提供该项目的重点机构及实收价格
  const indexIds = priceIndexes.map((p) => p.id);
  const { data: hospitalPrices } = await supabase
    .from('portal_hospital_prices')
    .select('*, portal_hospitals(id, name, slug, hospital_level, address, org_code, is_insurance_covered)')
    .in('price_index_id', indexIds);

  // 3. 查询同类避坑问答
  const { data: articles } = await supabase
    .from('portal_articles')
    .select('id, title, slug, direct_answer, published_at')
    .limit(6);

  // 4. 其他价格分类内链
  const otherCategories = Object.keys(CATEGORY_NAMES).filter((k) => k !== category);

  return { priceIndexes, hospitalPrices: hospitalPrices || [], articles: articles || [], otherCategories };
}

export default async function PriceCategoryPage({ params }: { params: { category: string } }) {
  const data = await getCategoryPriceData(params.category);
  if (!data) notFound();

  const { priceIndexes, hospitalPrices, articles, otherCategories } = data;
  const currentCategoryName = CATEGORY_NAMES[params.category] || '口腔诊疗';

  // Schema.org PriceSpecification + Table 结构化微数据
  const schemaOrg = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `2026 昆明市${currentCategoryName}价格表与收费标准汇总`,
    description: `昆明市各大正规口腔医院${currentCategoryName}公开参考收费、国家集采耗材全包基准价与避坑提示。`,
    about: {
      '@type': 'MedicalProcedure',
      name: currentCategoryName
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaOrg) }}
      />

      {/* 顶部面包屑 */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <Link href="/portal" className="text-slate-300 hover:text-emerald-400 transition font-medium">
              🦷 齿科指南网
            </Link>
            <span>/</span>
            <Link href="/portal#prices" className="hover:text-emerald-400 transition">价格指数</Link>
            <span>/</span>
            <span className="text-emerald-400">{currentCategoryName}</span>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
            国家集采执行跟踪
          </span>
        </div>
      </header>

      {/* 价格头部介绍 */}
      <section className="py-8 px-4 max-w-6xl mx-auto border-b border-slate-800/60">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-medium">
            <span>📊 2026 昆明口腔价格雷达 · {currentCategoryName}专栏</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight">
            昆明{currentCategoryName}大概多少钱？各品牌真实价格表
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            全面统计昆明公立三甲与民营二级专科的公开收费区间，涵盖耗材品牌、全包清单及常见低价陷阱，杜绝隐形加价。
          </p>
        </div>
      </section>

      {/* 核心 4 列表格 */}
      <section className="py-10 px-4 max-w-6xl mx-auto border-b border-slate-800/60">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <span>📋 {currentCategoryName}主流耗材与术式标准比价表</span>
        </h2>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40 mb-8">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800/50 text-slate-300 text-xs uppercase border-b border-slate-700/60">
              <tr>
                <th className="py-3 px-4">项目 / 品牌</th>
                <th className="py-3 px-4">昆明参考价格区间</th>
                <th className="py-3 px-4 hidden md:table-cell">标准包含清单（严防漏项增项）</th>
                <th className="py-3 px-4">集采性质</th>
                <th className="py-3 px-4">临床建议</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {priceIndexes.map((pi: any) => (
                <tr key={pi.id} className="hover:bg-slate-800/30 transition">
                  <td className="py-3.5 px-4 font-medium text-white">
                    <div>{pi.item_name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{pi.brand || '国标'}</div>
                  </td>
                  <td className="py-3.5 px-4 text-emerald-400 font-semibold">
                    ¥{pi.price_min} ~ ¥{pi.price_max} / {pi.price_unit}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-400 hidden md:table-cell">
                    {Array.isArray(pi.included_items) ? pi.included_items.join(' + ') : '常规项目包含'}
                  </td>
                  <td className="py-3.5 px-4">
                    {pi.is_procurement ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                        国家集采
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        自主定价
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-400">
                    {pi.guidance_desc || '适合常规适应症人群'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 机构实际收费对照 */}
        {hospitalPrices.length > 0 && (
          <div className="mt-8">
            <h3 className="text-base font-bold text-white mb-3">
              🏥 昆明重点机构该项目已核验执行价
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hospitalPrices.map((hp: any, idx: number) => {
                const hosp = hp.portal_hospitals;
                return (
                  <div key={idx} className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link href={`/portal/hospital/${hosp.slug}`} className="font-semibold text-sm text-slate-200 hover:text-emerald-400 transition">
                          {hosp.name}
                        </Link>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {hosp.hospital_level}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{hp.price_note || '执行透明全包一口价'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-emerald-400">¥{hp.price_val}</div>
                      <div className="text-[10px] text-slate-500">透明收费</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 延伸问答 */}
      <section className="py-10 px-4 max-w-6xl mx-auto border-b border-slate-800/60">
        <h2 className="text-xl font-bold text-white mb-4">
          💡 {currentCategoryName}避坑科普与患者高频问答
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {articles.map((a: any) => (
            <Link key={a.id} href={`/portal/ask/${a.slug}`} className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 hover:border-emerald-500/50 transition block space-y-2">
              <h3 className="font-semibold text-sm text-slate-200 hover:text-emerald-400 transition">
                {a.title}
              </h3>
              <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                {a.direct_answer}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* 其他项目快速穿透（内链闭环） */}
      <section className="py-10 px-4 max-w-6xl mx-auto">
        <h2 className="text-base font-bold text-white mb-4">
          🔄 查看昆明其他诊疗专科价格表
        </h2>
        <div className="flex flex-wrap gap-2">
          {otherCategories.map((c) => (
            <Link
              key={c}
              href={`/portal/price/${c}`}
              className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/40 text-xs text-slate-300 hover:border-emerald-500/50 hover:text-emerald-400 transition"
            >
              {CATEGORY_NAMES[c]}价格指数 →
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-800/80 bg-slate-900/80 py-8 px-4 text-center text-xs text-slate-500">
        <p>Copyright © 2026 中国口腔医疗健康指南与价格指数中心 · 昆明站</p>
      </footer>
    </div>
  );
}
