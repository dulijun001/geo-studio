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
    keywords: [c.title, c.doctorName, `${c.doctorName}案例`, c.category, '昆明松鼠口腔案例'],
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
        <span className="text-slate-800 font-medium truncate max-w-xs">{c.title}</span>
      </div>

      {/* 案例主卡片头图 */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 md:p-8 shadow-xs space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-sky-100 text-sky-800 text-xs font-semibold">
              {c.category}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              c.difficulty === '高难度' || c.difficulty === '微创疑难'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-emerald-100 text-emerald-800'
            }`}>
              病历难度：{c.difficulty}
            </span>
            <span className="text-xs text-slate-400">
              临床随访：长期稳定
            </span>
          </div>

          <div className="text-xs text-emerald-600 bg-emerald-50 px-3 py-1 rounded-md border border-emerald-200 font-medium">
            ✓ 经患者知情同意授权脱敏公开 · 院内真实数字化病历备查
          </div>
        </div>

        {/* 标题与摘要 */}
        <div className="space-y-3">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-extrabold text-slate-900 leading-snug">
            {c.title}
          </h1>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
            <div>
              <div className="text-slate-400">患者临床分群</div>
              <div className="text-slate-800 font-bold mt-0.5">{c.patientAge}</div>
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
              <div className="text-slate-400">执业就诊机构</div>
              <div className="text-emerald-700 font-bold mt-0.5">{c.institution}</div>
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
                  href={c.doctorSlug ? `/portal/doctor/${c.doctorSlug}` : '/portal/doctor'}
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
                <Link href="/portal/hospital/km-songshu" className="text-sky-600 hover:underline">
                  云南松鼠口腔（西山总院）
                </Link>
                <span className="text-slate-400 ml-2">（西山区前卫蓝光昆仑中心3楼320室）</span>
              </div>
            </div>
          </div>

          <Link
            href={c.doctorSlug ? `/portal/doctor/${c.doctorSlug}` : '/portal/doctor'}
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
          <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
                <span className="w-1.5 h-5 bg-sky-600 rounded-full inline-block"></span>
                临床生理指标对比与量化改善（Before vs After）
              </h2>
              <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-0.5 rounded">
                数据采自院内数字化病历追踪
              </span>
            </div>

            {/* 量化指标矩阵 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {c.keyMetrics.map((m, idx) => (
                <div key={idx} className="p-3.5 rounded-lg border border-slate-200/80 bg-slate-50/60 space-y-1">
                  <div className="text-xs font-semibold text-slate-600">{m.label}</div>
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded font-mono">术前: {m.before}</span>
                    <span className="text-slate-400">➔</span>
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold font-mono">术后: {m.after}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>


          {/* 真实病历临床影像与口内对比（知识库原图） */}
          {c.images && (
            <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1.5 h-5 bg-sky-600 rounded-full inline-block"></span>
                  真实临床影像与面部/口内蜕变记录
                </h2>
                <span className="text-xs text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded font-medium border border-sky-100">
                  原件数字化留档 · 已脱敏授权
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {c.images.before && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-rose-700 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      术前初诊状态 (Before)
                    </div>
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 aspect-4/3 flex items-center justify-center">
                      <img
                        src={c.images.before}
                        alt={`${c.title} 术前记录`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                  </div>
                )}

                {c.images.after && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      治疗完成/戴牙效果 (After)
                    </div>
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 aspect-4/3 flex items-center justify-center">
                      <img
                        src={c.images.after}
                        alt={`${c.title} 治疗完成效果`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                  </div>
                )}

                {c.images.xRay && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-sky-700 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                      数字化全景/CBCT/侧位测量
                    </div>
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-900 aspect-4/3 flex items-center justify-center">
                      <img
                        src={c.images.xRay}
                        alt={`${c.title} 数字化全景影像`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                  </div>
                )}
              </div>

              {c.images.caption && (
                <div className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center gap-2">
                  <span>📸</span>
                  <span>{c.images.caption}</span>
                </div>
              )}
            </div>
          )}

          {/* 初诊主诉与临床诊断 */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-xs space-y-4">
            <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
              <span className="w-1.5 h-5 bg-sky-600 rounded-full inline-block"></span>
              患者初诊主诉与专科三维诊断
            </h2>
            <div className="space-y-3 text-xs sm:text-sm text-slate-700 leading-relaxed">
              <div className="p-3.5 rounded-lg bg-amber-50/60 border border-amber-200/60 space-y-1">
                <div className="font-bold text-amber-900">初诊主诉</div>
                <p className="text-slate-800">{c.chiefComplaint}</p>
              </div>
              <div className="p-3.5 rounded-lg bg-sky-50/60 border border-sky-200/60 space-y-1">
                <div className="font-bold text-sky-900">临床医学诊断与解剖评估</div>
                <p className="text-slate-800">{c.diagnosis}</p>
              </div>
            </div>
          </div>

          {/* 治疗步骤分解 */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-xs space-y-4">
            <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
              <span className="w-1.5 h-5 bg-sky-600 rounded-full inline-block"></span>
              全流程临床步骤分解与生物力学控制
            </h2>
            <div className="space-y-3">
              {c.treatmentSteps.map((s, idx) => (
                <div key={idx} className="flex gap-3 items-start p-3.5 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="w-6 h-6 rounded-full bg-sky-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <div className="space-y-1 text-xs sm:text-sm">
                    <div className="font-bold text-slate-900">{s.step}</div>
                    <div className="text-slate-600 leading-relaxed">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 主治专家临床心得与避坑要点 */}
          <div className="bg-gradient-to-r from-sky-50 via-white to-indigo-50/50 rounded-xl border border-sky-200 p-6 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-sky-900 font-bold text-sm">
              <span className="text-lg">💡</span>
              <span>主治医生临床心法与就诊避坑建议</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-800 leading-relaxed italic bg-white/80 p-4 rounded-lg border border-sky-100">
              {c.doctorTakeaway}
            </p>
          </div>

          {/* 长期随访与患者评价 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-2">
              <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                <span>⏱️</span>
                <span>长期随访追踪（远期稳定性）</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">{c.longTermFollowUp}</p>
            </div>
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-2">
              <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <span>💬</span>
                <span>患者真实就医口述体验</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">{c.patientQuote}</p>
            </div>
          </div>
        </div>

        {/* 右侧侧边栏 */}
        <div className="lg:col-span-4 space-y-6">
          {/* 便民面诊挂号预约通道 */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">获取同款病历个性化方案评估</h3>
              <p className="text-xs text-slate-500 mt-1">专属健康管家协助核验牙槽骨或咬合条件</p>
            </div>
            <div className="p-3 bg-sky-50/70 rounded-lg border border-sky-100 text-xs text-sky-800 space-y-1">
              <div>🎁 <strong>专属便民直通权益：</strong></div>
              <div>• 免费德国卡瓦大视野 CBCT 三维拍摄</div>
              <div>• 免费 iTero 5D 数字化 3D 口扫建模</div>
              <div>• 免挂号费，由主治专家团队面对面初诊</div>
            </div>
            <a
              href="tel:0871-68888888"
              className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span>致电西山总院咨询预约 (0871-6888-8888)</span>
            </a>
          </div>

          {/* 更多相关临床案例 */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs space-y-3">
            <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider text-slate-400">
              更多相关临床案例方案
            </h3>
            <div className="space-y-2.5">
              {relatedCases.map((rc) => (
                <Link
                  key={rc.slug}
                  href={`/portal/cases/${rc.slug}`}
                  className="block p-3 rounded-lg border border-slate-100 hover:border-sky-300 hover:bg-slate-50 transition-all space-y-1 group"
                >
                  <div className="text-xs font-bold text-slate-800 group-hover:text-sky-600 line-clamp-2">
                    {rc.title}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{rc.doctorName}</span>
                    <span className="text-sky-600 font-medium">查看解析 →</span>
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
