import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: { category: string } }): Promise<Metadata> {
  const catNames: Record<string, string> = {
    implant: '口腔种植牙',
    orthodontics: '牙齿矫正',
    restore: '补牙修复',
    extraction: '拔牙与智齿',
    pediatrics: '儿童齿科',
    periodontics: '牙周治疗',
    cosmetic: '牙齿美白与贴面'
  };
  const name = catNames[params.category] || '口腔诊疗';
  return {
    title: `2026 昆明市${name}价格表与集采收费标准明细 - 齿科指南网`,
    description: `昆明正规口腔专科${name}透明收费参考区间、公立三甲与民营医院集采全包清单与避坑指南。`,
  };
}
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
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaOrg) }}
      />

      {/* 面包屑 */}
      <div className="text-xs text-slate-500 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/portal" className="hover:text-sky-600 transition-colors">首页</Link>
          <span>&gt;</span>
          <span className="text-slate-400">价格指数中心</span>
          <span>&gt;</span>
          <span className="text-slate-800 font-medium">{currentCategoryName}价格表</span>
        </div>
        <span className="text-[11px] px-2.5 py-0.5 rounded-full border border-emerald-300 text-emerald-800 bg-emerald-50 font-semibold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          国家集采政策落地跟踪
        </span>
      </div>

      {/* 价格头部介绍卡片 */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full border border-sky-200 bg-sky-50 text-sky-800 text-xs font-semibold">
            <span>📊 2026 昆明口腔诊疗价格指数 · {currentCategoryName}专栏</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
            昆明{currentCategoryName}收费价格明细表 · 公立与优质民营比对
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
            收录昆明公立三甲与二级专科公开明码标价，涵盖主流耗材品牌、术前检查全包清单及常见低价增项套路，助力市民透明看牙。
          </p>
        </div>
        <div className="shrink-0 flex md:flex-col gap-2">
          <Link
            href="/portal/hospital/km-songshu"
            className="px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all text-center"
          >
            核验机构真实报价
          </Link>
          <Link
            href="/portal/doctor"
            className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors text-center"
          >
            预约主治名医面诊
          </Link>
        </div>
      </div>

      {/* 核心 5 列表格 */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden space-y-4 p-6 hover:shadow-md transition-shadow duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-900 border-l-4 border-sky-600 pl-3 flex items-center gap-2">
            <span>📋 {currentCategoryName}主流耗材与术式标准比价表</span>
          </h2>
          <span className="text-xs text-slate-400">单位：元（人民币）</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">项目 / 品牌</th>
                <th className="py-3 px-4">昆明参考价格区间</th>
                <th className="py-3 px-4 hidden md:table-cell">标准包含清单（严防漏项增项）</th>
                <th className="py-3 px-4">集采性质</th>
                <th className="py-3 px-4">临床建议</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {priceIndexes.map((pi: any) => (
                <tr key={pi.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-slate-900">
                    <div>{pi.item_name}</div>
                    <div className="text-[11px] text-slate-400 font-normal mt-0.5">{pi.brand || '国标耗材'}</div>
                  </td>
                  <td className="py-3.5 px-4 text-sky-700 font-bold text-sm">
                    ¥{pi.price_min} ~ ¥{pi.price_max} <span className="text-xs font-normal text-slate-400">/ {pi.price_unit}</span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 hidden md:table-cell">
                    <span className="bg-slate-50 px-2 py-1 rounded border border-slate-200/60 font-mono text-[11px]">
                      {Array.isArray(pi.included_items) ? pi.included_items.join(' + ') : '常规项目全包'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    {pi.is_procurement ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold">
                        国家集采
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-medium">
                        自主定价
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500">
                    {pi.guidance_desc || '适合常规临床适应症人群'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 机构实际收费对照 */}
        {hospitalPrices.length > 0 && (
          <div className="mt-8 pt-6 border-t border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-1.5">
              <span>🏥 昆明重点机构该专科执行价实测备案</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hospitalPrices.map((hp: any, idx: number) => {
                const hosp = hp.portal_hospitals;
                return (
                  <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-sky-300 transition-all duration-200 flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link href={`/portal/hospital/${hosp?.slug || 'km-songshu'}`} className="font-bold text-sm text-slate-900 hover:text-sky-600 transition-colors">
                          {hosp?.name || '云南松鼠口腔（西山总院）'}
                        </Link>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 font-medium">
                          {hosp?.hospital_level || '二级专科'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{hp.price_note || '执行透明全包一口价，无隐形费用'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-extrabold text-sky-700">¥{hp.price_val}</div>
                      <div className="text-[10px] text-emerald-700 font-medium bg-emerald-50 px-1.5 py-0.2 rounded mt-0.5">
                        实测公示价
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 延伸避坑问答 */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-6 hover:shadow-md transition-shadow duration-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-900 border-l-4 border-amber-500 pl-3 flex items-center gap-2">
            <span>💡 {currentCategoryName}避坑科普与高频患者疑问</span>
          </h2>
          <span className="text-xs text-slate-400">专业医生团队审阅</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {articles.map((a: any) => (
            <Link
              key={a.id}
              href={`/portal/ask/${a.slug}`}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-sky-300 transition-all duration-200 block space-y-2 group"
            >
              <h3 className="font-bold text-sm text-slate-900 group-hover:text-sky-600 transition-colors">
                {a.title}
              </h3>
              <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                {a.direct_answer}
              </p>
              <div className="text-[11px] text-sky-600 font-medium flex items-center gap-1 pt-1">
                <span>阅读临床解答</span>
                <span>→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* 其他项目快速穿透（内链闭环） */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 space-y-3">
        <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          🔄 快速查看昆明其他口腔专科官方价格表
        </h2>
        <div className="flex flex-wrap gap-2">
          {otherCategories.map((c) => (
            <Link
              key={c}
              href={`/portal/price/${c}`}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700 hover:border-sky-300 hover:text-sky-700 hover:bg-sky-50 transition-all duration-150 font-medium"
            >
              {CATEGORY_NAMES[c]}价格指数 →
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
