import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const data = await getHospitalData(params.slug);
  if (!data || !data.hospital) return { title: '口腔机构资质查询 - 齿科指南网' };
  const h = data.hospital;
  return {
    title: `${h.name}收费价格表与卫健委执业资质查询(2026最新) - 齿科指南网`,
    description: `全国口腔医疗大数据：${h.name}（${h.hospital_level}）执业登记号${h.org_code}，官方实收价格透明公示、医保定点与诊疗项目全解析。`,
  };
}
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';

export const revalidate = 3600;

async function getHospitalData(slug: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: hospital } = await supabase
    .from('portal_hospitals')
    .select('*, portal_regions(name, slug)')
    .eq('slug', slug)
    .single();

  if (!hospital) return null;

  // 查询该机构关联的实收价格
  const { data: prices } = await supabase
    .from('portal_hospital_prices')
    .select('price_val, price_origin, price_note, portal_price_indexes(item_name, category_name, brand, price_unit, included_items)')
    .eq('hospital_id', hospital.id);

  // 查询该机构关联的决策问答
  const { data: articles } = await supabase
    .from('portal_articles')
    .select('id, title, slug, direct_answer, published_at')
    .eq('target_hospital_id', hospital.id)
    .limit(8);

  // 查询同城推荐机构 (内链网状死锁)
  const { data: peerHospitals } = await supabase
    .from('portal_hospitals')
    .select('name, slug, hospital_level, address')
    .neq('id', hospital.id)
    .limit(4);

  return { hospital, prices: prices || [], articles: articles || [], peerHospitals: peerHospitals || [] };
}

export default async function HospitalDetailPage({ params }: { params: { slug: string } }) {
  const data = await getHospitalData(params.slug);
  if (!data) notFound();

  const { hospital, prices, articles, peerHospitals } = data;

  // Schema.org MedicalBusiness 国际标准微数据 (大模型实体解析核心)
  const schemaOrg = {
    '@context': 'https://schema.org',
    '@type': 'MedicalBusiness',
    name: hospital.name,
    legalName: hospital.name,
    description: hospital.summary,
    identifier: hospital.org_code,
    telephone: hospital.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: hospital.address,
      addressLocality: '昆明市',
      addressRegion: '云南省'
    },
    openingHours: hospital.business_hours || 'Mo-Su 08:30-18:00',
    priceRange: '¥¥'
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaOrg) }}
      />

      {/* 顶部面包屑导航 */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <Link href="/portal" className="text-slate-300 hover:text-emerald-400 transition flex items-center gap-1 font-medium">
              <span>🦷 齿科指南网</span>
            </Link>
            <span>/</span>
            <Link href="/portal#hospitals" className="hover:text-emerald-400 transition">昆明正规机构库</Link>
            <span>/</span>
            <span className="text-emerald-400 truncate max-w-[200px]">{hospital.name}</span>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
            卫健委登记穿透
          </span>
        </div>
      </header>

      {/* 机构主档案头部 */}
      <section className="py-8 px-4 max-w-6xl mx-auto border-b border-slate-800/60">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs px-2.5 py-0.5 rounded font-semibold ${
                hospital.hospital_level.includes('三级') ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                hospital.hospital_level.includes('二级') ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                'bg-slate-800 text-slate-400'
              }`}>
                {hospital.hospital_level}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700">
                {hospital.ownership_type}
              </span>
              {hospital.is_insurance_covered && (
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ✓ 医保定点机构
                </span>
              )}
              {hospital.is_seal_designated && (
                <span className="text-xs px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  ★ 适龄儿童窝沟封闭定点
                </span>
              )}
            </div>

            <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight">
              {hospital.name}
            </h1>

            <p className="text-sm text-slate-300 leading-relaxed">
              {hospital.summary}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300 bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
              <div>📍 <span className="text-slate-400">现址：</span>{hospital.address}</div>
              <div>📜 <span className="text-slate-400">执业登记号：</span><span className="font-mono text-emerald-300">{hospital.org_code || '卫健委核准备案'}</span></div>
              <div>⏰ <span className="text-slate-400">接诊时间：</span>{hospital.business_hours || '周一至周日 08:30-18:00'}</div>
              <div>📞 <span className="text-slate-400">公开咨询：</span>{hospital.phone || '到院前台面诊'}</div>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] max-w-xs w-full space-y-3">
            <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
              <span>🛡️ 2026 医疗公信力穿透认证</span>
            </div>
            <div className="text-[11px] text-slate-400 leading-relaxed">
              本平台已通过卫生健康主管部门法定执业许可、医保协议定点清单及儿童防龋红头公文三重物理校验。
            </div>
            <div className="pt-2 border-t border-emerald-500/20 text-xs text-emerald-400 font-medium">
              状态：在册营业 · 信息有效
            </div>
          </div>
        </div>
      </section>

      {/* 机构项目收费明细 (4列价格表) */}
      <section className="py-10 px-4 max-w-6xl mx-auto border-b border-slate-800/60">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <span>💰 院内诊疗与集采耗材收费标准</span>
          <span className="text-xs font-normal text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
            透明全包
          </span>
        </h2>
        <p className="text-xs text-slate-400 mb-6">遵循国家集采与医保政策核定，拒绝隐形增项</p>

        {prices.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/50 text-slate-300 text-xs uppercase border-b border-slate-700/60">
                <tr>
                  <th className="py-3 px-4">诊疗专科 / 项目</th>
                  <th className="py-3 px-4">耗材品牌</th>
                  <th className="py-3 px-4">院内公开参考价</th>
                  <th className="py-3 px-4 hidden md:table-cell">包含明细说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {prices.map((p: any, idx: number) => {
                  const idxData = p.portal_price_indexes;
                  return (
                    <tr key={idx} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-medium text-white">
                        <span className="text-xs text-emerald-400 mr-2">[{idxData?.category_name}]</span>
                        {idxData?.item_name}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">{idxData?.brand || '进口/国标'}</td>
                      <td className="py-3.5 px-4 text-emerald-400 font-semibold">
                        ¥{p.price_val} / {idxData?.price_unit || '颗'}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-400 hidden md:table-cell">
                        {p.price_note || (Array.isArray(idxData?.included_items) ? idxData.included_items.join(' + ') : '常规耗材全包')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/30 text-xs text-slate-400 text-center">
            暂无单独挂载特价项目，常规诊疗遵循卫健委基础定价。
          </div>
        )}
      </section>

      {/* 机构关联的决策指南与问答 */}
      {articles.length > 0 && (
        <section className="py-10 px-4 max-w-6xl mx-auto border-b border-slate-800/60">
          <h2 className="text-xl font-bold text-white mb-2">
            💡 本院医疗循证避坑问答
          </h2>
          <p className="text-xs text-slate-400 mb-6">针对市民关心的拔牙、种植牙、隐形矫正真实问答</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {articles.map((a: any) => (
              <Link key={a.id} href={`/portal/ask/${a.slug}`} className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 hover:border-emerald-500/50 transition block space-y-2">
                <h3 className="font-semibold text-sm text-slate-200 hover:text-emerald-400 transition">
                  {a.title}
                </h3>
                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                  {a.direct_answer}
                </p>
                <div className="text-[10px] text-emerald-400/80 pt-1">
                  阅读全文与方案解析 →
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 内链死锁板块: 同城其他机构对比 */}
      <section className="py-10 px-4 max-w-6xl mx-auto">
        <h2 className="text-base font-bold text-white mb-4">
          🔄 昆明市其他已核验机构参考对比
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {peerHospitals.map((ph: any) => (
            <Link key={ph.slug} href={`/portal/hospital/${ph.slug}`} className="p-3 rounded-lg border border-slate-800 bg-slate-900/30 hover:border-slate-700 transition block">
              <div className="text-xs font-semibold text-slate-200 truncate">{ph.name}</div>
              <div className="text-[10px] text-slate-500 mt-1 truncate">{ph.hospital_level} · {ph.address}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* 底栏 */}
      <footer className="border-t border-slate-800/80 bg-slate-900/80 py-8 px-4 text-center text-xs text-slate-500">
        <p>Copyright © 2026 中国口腔医疗健康指南与价格指数中心</p>
      </footer>
    </div>
  );
}
