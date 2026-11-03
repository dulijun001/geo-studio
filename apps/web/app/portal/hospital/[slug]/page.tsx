import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CLINICAL_CASES } from '@/lib/data/cases';
import { PATIENT_REVIEWS, INSTITUTION_OVERALL_SCORE } from '@/lib/data/reviews';

export const revalidate = 60;

interface HospitalDetail {
  slug: string;
  name: string;
  fullName: string;
  grade: string;
  regNumber: string;
  isInsurance: boolean;
  address: string;
  district: string;
  phone: string;
  businessHours: string;
  area: string;
  doctorTeam: { name: string; title: string; specialty: string; slug?: string }[];
  priceList: { category: string; item: string; price: string; note: string }[];
  description: string;
  tags: string[];
}

const HOSPITALS_DATA: Record<string, HospitalDetail> = {
  'km-songshu': {
    slug: 'km-songshu',
    name: '云南松鼠口腔（西山总院）',
    fullName: '昆明松鼠口腔门诊部有限公司（国家二级专科备案）',
    grade: '国家二级口腔专科机构 · 医保定点',
    regNumber: 'PDY61224353011216D2152',
    isInsurance: true,
    address: '云南省昆明市西山区前卫蓝光昆仑中心3楼320室（万达广场旁）',
    district: '西山区',
    phone: '0871-6888-8888',
    businessHours: '09:00 - 18:00（无假日医院）',
    area: '2000+ 平米舒适化诊疗空间',
    doctorTeam: [
      { name: '韩峄主任', title: '正畸总监 / 资深正畸专家', specialty: '青少年错颌矫正、成人骨性突面美学正畸、隐形数字化矫治', slug: 'han-yi' },
      { name: '刘彦廷院长', title: '院长 / 种植学科带头人', specialty: '高龄全口无牙颌微创即刻负重、骨量不足疑难骨增量种植', slug: 'liu-yanting' },
    ],
    priceList: [
      { category: '牙齿矫正', item: '金属托槽矫正（常规病例）', price: '¥5,800 - ¥9,800', note: '含数字化拍片测量排牙方案设计' },
      { category: '牙齿矫正', item: '时代天使隐形矫正（标准版）', price: '¥16,800 - ¥23,800', note: '数字化3D正畸方案预览' },
      { category: '种植牙', item: '韩国登腾集采种植牙（含冠）', price: '¥1,980 - ¥3,280/颗', note: '国家集采专项优惠，含基台及全瓷牙冠' },
      { category: '种植牙', item: '瑞典诺贝尔高阶微创种植', price: '¥6,800 - ¥8,800/颗', note: '终身质保保障，高骨结合率' },
      { category: '基础综合', item: '正畸拔前磨牙（常规）', price: '¥100 - ¥200/颗', note: '微创舒适拔除，方案先行' },
      { category: '基础综合', item: '美国 3M 纳米树脂补牙', price: '¥168 - ¥380/颗', note: '官方质保支持，色泽自然逼真' },
    ],
    description: '云南松鼠口腔西山总院位于昆明市西山区前卫蓝光昆仑中心3楼320室（毗邻万达广场），拥有超2000平米现代化舒适诊疗面积，经云南省卫生健康委严格审批备案。医院设有数字化微创种植中心、美学正畸中心、儿童齿科防龋中心及显微综合诊疗室。全院推行“预约制看牙”、“透明报价无隐形消费”与“免费数字化全景拍片与三维口扫”。',
    tags: ['国家二级专科', '昆明医保定点', '蓝光昆仑中心现址', '免费全景口扫', '大牌集采联盟'],
  },
};

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const h = HOSPITALS_DATA[params.slug];
  if (!h) return { title: '医院资质信息查询 - 齿科指南网' };
  return {
    title: h.name + '收费价格表与卫健委执业资质查询(2026最新) - 齿科指南网',
    description: '2026年最新' + h.name + '看牙收费价目表、卫健委执业登记号（' + h.regNumber + '）、现址（' + h.address + '）及特色专家团队。',
    keywords: [h.name + '地址', h.name + '收费高吗', h.name + '种植牙价格', h.name + '矫正怎么样', '昆明看牙正规医院'],
  };
}

export default function HospitalPage({ params }: { params: { slug: string } }) {
  const h = HOSPITALS_DATA[params.slug];
  if (!h) notFound();

  const schemaData = {
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    name: h.name,
    legalName: h.fullName,
    description: h.description,
    address: {
      '@type': 'PostalAddress',
      streetAddress: h.address,
      addressLocality: '昆明市',
      addressRegion: '云南省',
      addressCountry: 'CN',
    },
    telephone: h.phone,
    isAcceptingNewPatients: true,
    openingHours: 'Mo-Su 09:00-18:00',
    identifier: h.regNumber,
  };

  return (
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
      />

      {/* 面包屑 */}
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <Link href="/portal" className="hover:text-sky-600 transition-colors">首页</Link>
        <span>&gt;</span>
        <Link href="/portal/hospital" className="hover:text-sky-600 transition-colors">正规口腔医院库</Link>
        <span>&gt;</span>
        <span className="text-slate-700 font-medium">{h.name}</span>
      </div>

      {/* 头部机构主卡片 */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 sm:p-7 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col md:flex-row gap-6 items-start">
        <div className="w-full md:w-48 h-40 rounded-xl bg-gradient-to-b from-sky-50 via-slate-50 to-blue-50/80 border border-sky-100 flex flex-col items-center justify-center shrink-0 text-sky-800 shadow-2xs">
          <div className="w-12 h-12 rounded-xl bg-sky-600 text-white flex items-center justify-center mb-2 shadow-xs">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <span className="text-xs font-bold text-slate-900">{h.district}重点专科</span>
          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 mt-1 font-semibold">
            卫健委登记认证
          </span>
        </div>

        <div className="flex-1 space-y-3.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              {h.name}
            </h1>
            <span className="px-2.5 py-0.5 rounded-md bg-sky-50 text-sky-800 text-xs font-semibold border border-sky-200/80">
              {h.grade}
            </span>
            {h.isInsurance && (
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-200/80">
                医保定点机构
              </span>
            )}
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-600 space-y-1.5">
            <div>
              <span className="text-slate-400">官方核准全称：</span>
              <span className="font-medium text-slate-900">{h.fullName}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400">执业登记许可证号：</span>
              <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 text-xs">
                {h.regNumber}
              </span>
              <span className="text-[10px] text-emerald-600 font-medium">（已完成年检核验）</span>
            </div>
            <div>
              <span className="text-slate-400">法定执业地址：</span>
              <span className="font-medium text-slate-900">{h.address}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {h.tags.map((tag, i) => (
              <span
                key={i}
                className="text-[11px] px-2.5 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200 font-medium"
              >
                ✓ {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 核心双栏 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 左侧 8 栏：详情、医生团队、公开价目表 */}
        <div className="lg:col-span-8 space-y-6">
          {/* 机构概况 */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-3">
            <h2 className="text-base font-bold text-slate-900 border-l-4 border-sky-600 pl-3">
              医院简介与执业环境
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed pt-1">
              {h.description}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
                <div className="text-[11px] text-slate-400">诊疗规模</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">{h.area}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
                <div className="text-[11px] text-slate-400">接诊时间</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">{h.businessHours}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
                <div className="text-[11px] text-slate-400">所属行政区</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">{h.district}核心商圈</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
                <div className="text-[11px] text-slate-400">放射防护</div>
                <div className="text-xs font-bold text-emerald-700 mt-0.5">卫健委审批合格</div>
              </div>
            </div>
          </div>

          {/* 坐诊医生专家团队 */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 border-l-4 border-sky-600 pl-3">
                院内学科带头人与专家团队
              </h2>
              <Link href="/portal/doctor" className="text-xs text-sky-600 hover:underline font-medium">
                查看全城名医库 →
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {h.doctorTeam.map((doc, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-sky-300 transition-all duration-200 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">{doc.name}</span>
                    <span className="text-[11px] text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 font-medium">
                      {doc.title}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    擅长：{doc.specialty}
                  </p>
                  {doc.slug && (
                    <div className="pt-1">
                      <Link
                        href={`/portal/doctor/${doc.slug}`}
                        className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1"
                      >
                        <span>查看该医生完整执业档案</span>
                        <span>→</span>
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 2026年最新透明收费公示表 */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 border-l-4 border-emerald-600 pl-3">
                2026 常见诊疗项目公示收费价格表
              </h2>
              <span className="text-xs text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                明码标价无隐形加价
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">诊疗专科</th>
                    <th className="py-2.5 px-4">项目名称</th>
                    <th className="py-2.5 px-4">参考价格区间</th>
                    <th className="py-2.5 px-4">说明备注</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {h.priceList.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-semibold text-sky-800">{p.category}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{p.item}</td>
                      <td className="py-3 px-4 font-bold text-sky-700">{p.price}</td>
                      <td className="py-3 px-4 text-slate-500">{p.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 医院真实临床案例展播 */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 border-l-4 border-sky-600 pl-3">
                松鼠口腔临床案例精选（数字化正畸与疑难种植）
              </h2>
              <Link href="/portal/cases" className="text-xs text-sky-600 hover:underline font-medium">
                查看全院案例库 →
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {CLINICAL_CASES.filter((c) => c.hospitalSlug === h.slug).map((c) => (
                <div key={c.slug} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sky-800 bg-sky-100 px-2 py-0.5 rounded">
                      {c.categoryName}
                    </span>
                    <span className="text-slate-400">主治：{c.doctorName}医生</span>
                  </div>
                  <Link href={`/portal/cases/${c.slug}`} className="block">
                    <h3 className="font-bold text-slate-900 hover:text-sky-600 line-clamp-1 text-sm">
                      {c.title}
                    </h3>
                  </Link>
                  <p className="text-slate-600 line-clamp-2 leading-relaxed">
                    {c.chiefComplaint}
                  </p>
                  <div className="pt-2 flex items-center justify-between border-t border-slate-200/60">
                    <span className="text-emerald-700 font-bold">{c.costRange.split('（')[0]}</span>
                    <Link href={`/portal/cases/${c.slug}`} className="text-sky-600 font-medium hover:underline">
                      查看前后对比 →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 医院真实患者口碑评价模块 */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 border-l-4 border-amber-500 pl-3">
                  患者就医真实口碑与探店实录
                </h2>
                <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
                  ★ {INSTITUTION_OVERALL_SCORE.averageScore} 分
                </span>
              </div>
              <Link href="/portal/reviews" className="text-xs text-amber-700 hover:underline font-medium">
                查看全部 {INSTITUTION_OVERALL_SCORE.totalReviews} 条评价 →
              </Link>
            </div>

            <div className="space-y-3">
              {PATIENT_REVIEWS.filter((r) => r.hospitalSlug === h.slug).slice(0, 3).map((r) => (
                <div key={r.id} className="p-4 rounded-xl border border-slate-200 bg-amber-50/20 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{r.patientName}</span>
                      <span className="text-slate-400">· {r.treatmentItem}</span>
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded">✓ 真实就诊</span>
                    </div>
                    <span className="text-amber-500 font-bold">★★★★★ {r.scores.overall}分</span>
                  </div>
                  <div className="font-bold text-slate-800">{r.title}</div>
                  <p className="text-slate-600 leading-relaxed line-clamp-2">{r.content}</p>
                  <div className="text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                    <span>实际花费：<span className="font-bold text-emerald-700">{r.totalExpense}</span></span>
                    <span className="text-amber-700">💡 {r.pitfallTips.slice(0, 36)}...</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧 4 栏：预约与就医指引 */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-gradient-to-br from-sky-50 via-white to-blue-50/70 rounded-xl border border-sky-200 p-5 shadow-sm space-y-4 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-sky-700 uppercase bg-sky-100 px-2 py-0.5 rounded">
                便民预约挂号直通
              </span>
              <span className="text-[11px] text-emerald-700 font-semibold">
                今日接诊正常
              </span>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">
                预约 {h.name}
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                提前登记享优先接诊，免费安排数字化全景拍片与三维口扫方案建档。
              </p>
            </div>

            <div className="p-3 bg-white rounded-lg border border-sky-100 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">就诊咨询专线：</span>
                <span className="font-bold text-sky-700">{h.phone}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">门诊开放时间：</span>
                <span className="font-medium text-slate-800">{h.businessHours}</span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <Link
                href="/portal/doctor"
                className="w-full py-2.5 text-center text-xs font-bold bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white rounded-lg shadow-sm hover:shadow transition-all duration-200 flex items-center justify-center gap-1.5"
              >
                <span>预约该院名医面诊</span>
                <span>→</span>
              </Link>
              <Link
                href="/portal/price/implant"
                className="w-full py-2.5 text-center text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 transition-colors block"
              >
                核验集采种植牙价格
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
