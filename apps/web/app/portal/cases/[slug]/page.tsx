import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CLINICAL_CASES } from '@/lib/data/cases';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const c = CLINICAL_CASES.find((item) => item.slug === params.slug);
  if (!c) return { title: '临床案例详情 - 齿科指南网' };

  return {
    title: `${c.title} - ${c.doctorName}医生临床方案解析 - 齿科指南网`,
    description: `为您呈现昆明松鼠口腔${c.doctorName}（${c.doctorTitle}）主治的“${c.title}”，包含治疗周期（${c.duration}）、采用材料（${c.materials}）、详细三维数字化方案及治疗前后效果对比。`,
    keywords: [c.title, c.doctorName, `${c.doctorName}案例`, c.categoryName, '昆明松鼠口腔案例'],
  };
}

export default function CaseDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const c = CLINICAL_CASES.find((item) => item.slug === params.slug);
  if (!c) notFound();

  // 关联医生其他案例或推荐案例
  const relatedCases = CLINICAL_CASES.filter((item) => item.slug !== c.slug);

  return (
    <div className="space-y-6">
      {/* 顶部面包屑 */}
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <Link href="/portal" className="hover:text-sky-600">首页</Link>
        <span>&gt;</span>
        <Link href="/portal/cases" className="hover:text-sky-600">真实临床案例库</Link>
        <span>&gt;</span>
        <span className="text-slate-800 font-medium">{c.title}</span>
      </div>

      {/* 案例主卡片头图 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-8 shadow-xs space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-sky-100 text-sky-800 text-xs font-semibold">
              {c.categoryName}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              c.difficulty === '骨性疑难' || c.difficulty === '高难度'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-emerald-100 text-emerald-800'
            }`}>
              病历难度：{c.difficulty}
            </span>
            <span className="text-xs text-slate-400">
              发布时间：{c.publishedDate}
            </span>
          </div>

          <div className="text-xs text-emerald-600 bg-emerald-50 px-3 py-1 rounded-md border border-emerald-200 font-medium">
            ✓ 经患者知情同意授权脱敏公开 · 院内病例号已备查
          </div>
        </div>

        {/* 标题与摘要 */}
        <div className="space-y-3">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-extrabold text-slate-900 leading-snug">
            {c.title}
          </h1>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
            <div>
              <div className="text-slate-400">患者基本情况</div>
              <div className="text-slate-800 font-bold mt-0.5">{c.patientGender} · {c.patientAge}</div>
            </div>
            <div>
              <div className="text-slate-400">治疗总周期</div>
              <div className="text-slate-800 font-bold mt-0.5">{c.duration}</div>
            </div>
            <div>
              <div className="text-slate-400">选用临床材料</div>
              <div className="text-sky-700 font-bold mt-0.5 truncate" title={c.materials}>{c.materials}</div>
            </div>
            <div>
              <div className="text-slate-400">参考总费用范围</div>
              <div className="text-emerald-700 font-bold mt-0.5">{c.costRange.split('（')[0]}</div>
            </div>
          </div>
        </div>

        {/* 主治专家与机构联合背书条 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-gradient-to-r from-sky-50 to-indigo-50/50 border border-sky-100">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-sky-600 text-white flex items-center justify-center text-2xl shadow-sm shrink-0">
              👨‍⚕️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/portal/doctor/${c.doctorSlug}`}
                  className="text-base font-bold text-slate-900 hover:text-sky-600"
                >
                  主治医生：{c.doctorName}
                </Link>
                <span className="text-xs px-2 py-0.5 bg-white rounded border border-sky-200 text-sky-700 font-medium">
                  {c.doctorTitle}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                执业坐诊：
                <Link href={`/portal/hospital/${c.hospitalSlug}`} className="text-sky-600 hover:underline">
                  {c.hospitalName}
                </Link>
                <span className="text-slate-400 ml-2">（{c.hospitalAddress}）</span>
              </div>
            </div>
          </div>

          <Link
            href={`/portal/doctor/${c.doctorSlug}`}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors shrink-0"
          >
            预约该医生方案评估
          </Link>
        </div>
      </div>

      {/* 核心内容网格：左侧临床详情，右侧侧边栏引导 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 左侧主体 */}
        <div className="lg:col-span-8 space-y-6">
          {/* 治疗前后量化蜕变与对比（重点展示） */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
                <span className="w-1 h-5 bg-sky-600 rounded-full inline-block"></span>
                临床指标对比与蜕变效果（Before vs After）
              </h2>
              <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-0.5 rounded">
                数据采自院内数字化病历追踪
              </span>
            </div>

            {/* 描述对照 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80 space-y-1.5">
                <div className="font-bold text-slate-700 flex items-center gap-1.5 text-sm">
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                  治疗前临床体征（Before）
                </div>
                <p className="text-slate-600 leading-relaxed">
                  {c.beforeAfterComparison.beforeDesc}
                </p>
              </div>

              <div className="p-4 bg-sky-50/70 rounded-lg border border-sky-200 space-y-1.5">
                <div className="font-bold text-sky-800 flex items-center gap-1.5 text-sm">
                  <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                  治疗后蜕变效果（After）
                </div>
                <p className="text-sky-900 leading-relaxed font-medium">
                  {c.beforeAfterComparison.afterDesc}
                </p>
              </div>
            </div>

            {/* 量化指标量表 */}
            <div className="pt-2">
              <div className="text-xs font-bold text-slate-700 mb-2">
                关键生理学测量与骨骼/美学指标量化表：
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-2.5 px-3">核心观察指标</th>
                      <th className="py-2.5 px-3 border-l border-slate-200">术前初诊数值</th>
                      <th className="py-2.5 px-3 border-l border-slate-200 text-sky-700 bg-sky-50/50">
                        术后/随访达标数值
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {c.beforeAfterComparison.metrics.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-medium text-slate-700">{m.label}</td>
                        <td className="py-2.5 px-3 border-l border-slate-100 text-slate-500">{m.before}</td>
                        <td className="py-2.5 px-3 border-l border-slate-100 text-sky-800 font-bold bg-sky-50/30">
                          {m.after}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 临床诊断与主诉 */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-sky-600 rounded-full inline-block"></span>
              临床诊断与病因机制分析
            </h2>
            <div className="space-y-3 text-xs md:text-sm text-slate-600 leading-relaxed">
              <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-100 text-amber-900 text-xs">
                <span className="font-bold">【主诉困扰】</span> {c.chiefComplaint}
              </div>
              <p>
                <span className="font-semibold text-slate-800">专科诊断结论：</span>
                {c.clinicalDiagnosis}
              </p>
            </div>
          </div>

          {/* 治疗方案步骤分解 */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-sky-600 rounded-full inline-block"></span>
              主治团队全流程方案步骤拆解
            </h2>
            <div className="space-y-3">
              {c.treatmentPlan.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs md:text-sm">
                  <span className="w-6 h-6 rounded-full bg-sky-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="text-slate-700 leading-relaxed">
                    {step}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 数字化3D模拟与美学考量 */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-3">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-sky-600 rounded-full inline-block"></span>
              数字化三维模拟与避坑考量
            </h2>
            <p className="text-xs md:text-sm text-slate-600 leading-relaxed">
              {c.simulationNotes}
            </p>
          </div>

          {/* 患者亲述反馈与随访 */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-sky-600 rounded-full inline-block"></span>
              患者亲述就诊体验与术后远期随访
            </h2>
            <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-100 text-xs md:text-sm text-emerald-900 leading-relaxed italic">
              {c.patientFeedback}
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-2 pt-1">
              <span className="font-semibold text-slate-700">远期稳定性随访：</span>
              <span className="text-slate-700">{c.followUpStatus}</span>
            </div>
          </div>
        </div>

        {/* 右侧边栏：方案预约留资与推荐案例 */}
        <div className="lg:col-span-4 space-y-6">
          {/* 同款方案免费预审卡片 */}
          <div className="bg-white rounded-xl border border-sky-300 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-sky-600 text-white flex items-center justify-center font-bold text-sm">
                📋
              </div>
              <div>
                <div className="font-bold text-sm text-slate-900">获取同款病历方案与报价</div>
                <div className="text-[11px] text-slate-400">松鼠口腔专科绿色就医通道</div>
              </div>
            </div>

            <div className="text-xs text-slate-600 leading-relaxed bg-sky-50 p-3 rounded-lg border border-sky-100">
              您的牙齿是否也有类似“{c.title.split('：')[0]}”的情况？齿科指南网联合松鼠口腔提供专科医生<span className="font-bold text-sky-700">免费看牙拍片与初步3D口扫方案</span>。
            </div>

            <div className="space-y-2.5 text-xs text-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-500">✓</span> 享免初诊挂号费与全景片费
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-500">✓</span> 预约主治医生（韩峄/刘彦廷）亲诊评估
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-500">✓</span> 透明公示无隐形加价收费
              </div>
            </div>

            <Link
              href={`/portal/hospital/${c.hospitalSlug}`}
              className="block w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-center rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              点击进入松鼠口腔官方主页预约
            </Link>
          </div>

          {/* 更多经典临床案例 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
              更多专科临床实操案例
            </h3>
            <div className="space-y-3 pt-1">
              {relatedCases.map((rc) => (
                <Link
                  key={rc.slug}
                  href={`/portal/cases/${rc.slug}`}
                  className="block group p-2.5 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200"
                >
                  <div className="text-xs font-semibold text-slate-800 group-hover:text-sky-600 line-clamp-2 leading-snug">
                    {rc.title}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                    <span>主治：{rc.doctorName}</span>
                    <span className="text-sky-600">{rc.categoryName}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
