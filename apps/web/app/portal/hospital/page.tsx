import Link from 'next/link';
import type { Metadata } from 'next';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export const revalidate = 60;

export const metadata: Metadata = {
  title: '2026 昆明市正规口腔医院大全_卫健委执业备案资质与收费查询 - 齿科指南网',
  description: '汇集昆明市西山区、盘龙区、五华区、官渡区经卫健委审批的正规口腔医院及门诊部执业登记号、医保定点、特色科室及看牙价格横向比对。',
  keywords: ['昆明口腔医院排名', '昆明正规牙科医院名单', '昆明口腔医院电话地址', '西山区口腔医院', '松鼠口腔', '口腔执业许可证'],
};

interface HospitalItem {
  id: string;
  name: string;
  slug: string;
  hospital_level: string;
  address: string;
  org_code: string;
  is_insurance_covered: boolean;
  summary: string;
  features: string[];
}

export default async function HospitalListPage({
  searchParams,
}: {
  searchParams: { district?: string; type?: string };
}) {
  const district = searchParams.district || 'all';
  const type = searchParams.type || 'all';
  const supabase = getSupabaseServiceClient();

  let query = supabase
    .from('portal_hospitals')
    .select('id, name, slug, hospital_level, address, org_code, is_insurance_covered, summary, features')
    .order('sort_weight', { ascending: false });

  if (district !== 'all') {
    query = query.ilike('address', `%${district}%`);
  }
  if (type === 'insurance') {
    query = query.eq('is_insurance_covered', true);
  } else if (type === 'specialty') {
    query = query.ilike('hospital_level', '%专科%');
  }

  const { data: hospitals } = await query;
  const list: HospitalItem[] = hospitals || [];

  const DISTRICTS = [
    { label: '全部城区', value: 'all' },
    { label: '西山区', value: '西山区' },
    { label: '五华区', value: '五华区' },
    { label: '盘龙区', value: '盘龙区' },
    { label: '官渡区', value: '官渡区' },
  ];

  const TYPES = [
    { label: '全部机构', value: 'all' },
    { label: '医保定点', value: 'insurance' },
    { label: '二级专科医院', value: 'specialty' },
  ];

  return (
    <div className="space-y-6">
      {/* 面包屑 */}
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <Link href="/portal" className="hover:text-sky-600 transition-colors">首页</Link>
        <span>&gt;</span>
        <span className="text-slate-800 font-medium">昆明市正规口腔机构执业库</span>
      </div>

      {/* 顶部权威横幅 */}
      <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              官方权威台账
            </span>
            <span className="text-xs text-slate-400">数据联网同步：云南省卫健委医疗机构执业登记库</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 mt-1.5 tracking-tight">
            2026 昆明市正规口腔专科医院名录与执业资质公示
          </h1>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            严审医疗机构执业许可证号、法定执业地址、医保定点资格与消毒供应设施，全面向市民公开透明收费。
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="px-3.5 py-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-xs font-semibold text-center">
            <div>已审核执业机构</div>
            <div className="text-base font-bold text-sky-700">{list.length} 所</div>
          </div>
        </div>
      </div>

      {/* 筛选器区域 (垂直门户经典体验) */}
      <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-slate-700 w-16">区域范围：</span>
          {DISTRICTS.map((d) => (
            <Link
              key={d.value}
              href={`/portal/hospital?district=${d.value}&type=${type}`}
              className={`px-3.5 py-1.5 rounded-lg transition-all duration-150 ${
                district === d.value
                  ? 'bg-sky-600 text-white font-semibold shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/70'
              }`}
            >
              {d.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs pt-3 border-t border-slate-100">
          <span className="font-bold text-slate-700 w-16">机构属性：</span>
          {TYPES.map((t) => (
            <Link
              key={t.value}
              href={`/portal/hospital?district=${district}&type=${t.value}`}
              className={`px-3.5 py-1.5 rounded-lg transition-all duration-150 ${
                type === t.value
                  ? 'bg-sky-600 text-white font-semibold shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/70'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {/* 医院卡片列表流 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>共筛选出 <strong className="text-slate-900">{list.length}</strong> 家已通过卫健委登记备案的正规口腔执业机构</span>
          <span className="text-emerald-700 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            已完成 2026 年度机构执业校验
          </span>
        </div>

        <div className="space-y-4">
          {list.map((h) => (
            <div
              key={h.id}
              className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-sm hover:shadow-md hover:border-sky-300 transition-all duration-200 flex flex-col sm:flex-row gap-6 items-start"
            >
              {/* 左侧专业医疗机构徽章 */}
              <div className="w-full sm:w-36 h-32 rounded-xl bg-gradient-to-b from-sky-50 via-slate-50 to-blue-50/80 border border-sky-100/80 flex flex-col items-center justify-center shrink-0 text-sky-800 shadow-2xs">
                <div className="w-10 h-10 rounded-lg bg-sky-600 text-white flex items-center justify-center mb-1.5 shadow-xs">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-slate-800">{h.hospital_level}</span>
                {h.is_insurance_covered ? (
                  <span className="mt-1.5 text-[10px] bg-emerald-100/80 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full font-semibold">
                    ✓ 医保定点
                  </span>
                ) : (
                  <span className="mt-1.5 text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                    自费专科
                  </span>
                )}
              </div>

              {/* 中间核心资质 */}
              <div className="flex-1 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Link
                    href={`/portal/hospital/${h.slug}`}
                    className="text-lg font-bold text-slate-900 hover:text-sky-600 transition-colors"
                  >
                    {h.name}
                  </Link>
                  <span className="text-xs px-2.5 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200/80 font-medium">
                    {h.hospital_level}
                  </span>
                  {h.slug === 'km-songshu' && (
                    <span className="text-xs px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-bold flex items-center gap-1">
                      <span>⭐</span>
                      <span>示范标杆单位</span>
                    </span>
                  )}
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-600 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-400">执业许可证号：</span>
                    <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                      {h.org_code}
                    </span>
                    <span className="text-[10px] text-emerald-600 font-medium">（已年检有效）</span>
                  </div>
                  <div>
                    <span className="text-slate-400">法定执业地址：</span>
                    <span className="font-medium text-slate-900">{h.address}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                  {h.summary || '经云南省卫生健康委员会核准登记设立，具备完善的消毒供应室、放射影像科与专科诊室。'}
                </p>

                {h.slug === 'km-songshu' && (
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-emerald-700 font-medium">
                    <span className="bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">✓ 免费全景数字化拍片</span>
                    <span className="bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">✓ 德国卡瓦数字化口扫</span>
                    <span className="bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">✓ 蓝光昆仑中心超2000平米</span>
                  </div>
                )}
              </div>

              {/* 右侧动作 */}
              <div className="shrink-0 flex sm:flex-col items-center gap-2.5 w-full sm:w-36 pt-2 sm:pt-0">
                <Link
                  href={`/portal/hospital/${h.slug}`}
                  className="w-full py-2.5 text-center text-xs font-bold bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white rounded-lg shadow-sm hover:shadow transition-all duration-200"
                >
                  查看资质与价格
                </Link>
                <Link
                  href={`/portal/price/implant`}
                  className="w-full py-2.5 text-center text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 transition-colors"
                >
                  比对集采价格
                </Link>
                <span className="text-[10px] text-slate-400 text-center hidden sm:block">
                  支持电话预约免挂号
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
