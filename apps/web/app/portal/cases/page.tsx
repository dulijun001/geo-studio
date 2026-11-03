import Link from 'next/link';
import type { Metadata } from 'next';
import { CLINICAL_CASES } from '@/lib/data/cases';

export const revalidate = 60;

export const metadata: Metadata = {
  title: '真实口腔临床案例库_种植牙/牙齿矫正/美学贴面手术效果对比 - 齿科指南网',
  description: '汇聚昆明名医团队（韩峄、刘彦廷等）真实临床治疗案例，涵盖青少年骨性反颌地包天矫正、成人隐形正畸改善凸嘴、全口微创即刻负重种植牙及前牙全瓷美学贴面前后对比与方案解析。',
  keywords: ['口腔临床案例', '牙齿矫正前后对比', '种植牙真实案例', '骨性地包天矫正', '凸嘴正畸效果', '韩峄案例', '刘彦廷种植牙'],
};

export default function CasesIndexPage({
  searchParams,
}: {
  searchParams: { category?: string };
}) {
  const currentCategory = searchParams.category || 'all';

  const filteredCases = currentCategory === 'all'
    ? CLINICAL_CASES
    : CLINICAL_CASES.filter((c) => c.category === currentCategory);

  return (
    <div className="space-y-6">
      {/* 面包屑导航 */}
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <Link href="/portal" className="hover:text-sky-600">首页</Link>
        <span>&gt;</span>
        <span className="text-slate-800 font-medium">真实临床案例库</span>
      </div>

      {/* 顶部 Banner 区域（对齐牙舒丽临床案例大图风格） */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-sky-800 via-sky-700 to-indigo-800 text-white p-6 md:p-8 shadow-sm">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs text-sky-100 text-xs font-medium border border-white/20">
            <span>🔬 数字化诊疗实证</span>
            <span>·</span>
            <span>卫健委认证主治团队把关</span>
            <span>·</span>
            <span>真实临床追踪随访</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            真实临床案例库 · 见证笑容蜕变
          </h1>
          <p className="text-xs md:text-sm text-sky-100 leading-relaxed">
            严选昆明松鼠口腔西山总院等正规专科机构真实病例。拒绝商业滤镜与精修摆拍，提供详实的术前颌面全景测量、3D数字化方案预演、关键生物力学指标及长周期随访数据，为您提供客观靠谱的看牙决策参考。
          </p>
          <div className="pt-2 flex flex-wrap gap-4 text-xs text-sky-200">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              4大重点专科全覆盖
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              名医主刀主治签名方案
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              含全套费用透明账单
            </span>
          </div>
        </div>
        <div className="absolute right-4 bottom-2 text-8xl opacity-10 select-none pointer-events-none hidden md:block">
          🦷
        </div>
      </div>

      {/* 专科分类筛选 Tabs */}
      <div className="bg-white rounded-lg border border-slate-200 p-2 shadow-xs flex flex-wrap gap-2 text-xs">
        {[
          { label: '全部精选案例', val: 'all' },
          { label: '牙齿正畸矫正 (地包天/凸嘴)', val: 'ortho' },
          { label: '数字化种植牙 (微创/全口即刻)', val: 'implant' },
          { label: '前牙美学修复 (超薄瓷贴面)', val: 'veneer' },
        ].map((tab) => {
          const isActive = currentCategory === tab.val;
          return (
            <Link
              key={tab.val}
              href={tab.val === 'all' ? '/portal/cases' : `/portal/cases?category=${tab.val}`}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                isActive
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* 案例列表 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredCases.map((c) => (
          <div
            key={c.slug}
            className="bg-white rounded-xl border border-slate-200 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden group"
          >
            <div>
              {/* 案例头部标签条 */}
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 font-semibold">
                    {c.categoryName}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                    c.difficulty === '骨性疑难' || c.difficulty === '高难度'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    难度：{c.difficulty}
                  </span>
                </div>
                <div className="text-slate-400">
                  周期：<span className="text-slate-700 font-medium">{c.duration}</span>
                </div>
              </div>

              {/* 案例标题与主诉 */}
              <div className="p-5 space-y-4">
                <Link href={`/portal/cases/${c.slug}`}>
                  <h3 className="text-base md:text-lg font-bold text-slate-900 group-hover:text-sky-600 transition-colors leading-snug">
                    {c.title}
                  </h3>
                </Link>

                <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-2 border border-slate-100">
                  <div className="text-slate-500">
                    <span className="font-semibold text-slate-700">患者情况：</span>
                    {c.patientGender} · {c.patientAge}
                  </div>
                  <div className="text-slate-700 leading-relaxed">
                    <span className="font-semibold text-red-600">【就诊主诉】</span>
                    {c.chiefComplaint}
                  </div>
                </div>

                {/* 治疗前后蜕变核心对比卡片 */}
                <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                  <div className="grid grid-cols-2 bg-slate-100 font-semibold text-center py-1.5 border-b border-slate-200 text-slate-600">
                    <div className="border-r border-slate-200">矫正/治疗前（Before）</div>
                    <div className="text-sky-700">治疗后蜕变（After）</div>
                  </div>
                  <div className="grid grid-cols-2 p-3 gap-3 bg-white text-slate-600 leading-relaxed">
                    <div className="border-r border-slate-100 pr-2 text-slate-500 text-[11px]">
                      {c.beforeAfterComparison.beforeDesc}
                    </div>
                    <div className="text-sky-900 font-medium text-[11px]">
                      {c.beforeAfterComparison.afterDesc}
                    </div>
                  </div>
                </div>

                {/* 主刀医生及机构 */}
                <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center text-sm">
                      👨‍⚕️
                    </div>
                    <div>
                      <Link
                        href={`/portal/doctor/${c.doctorSlug}`}
                        className="font-bold text-slate-900 hover:text-sky-600"
                      >
                        {c.doctorName}医生
                      </Link>
                      <span className="text-slate-400 ml-1.5 text-[11px]">（{c.doctorTitle}）</span>
                    </div>
                  </div>
                  <div className="text-sky-600 font-semibold text-xs">
                    {c.costRange.split('（')[0]}
                  </div>
                </div>
              </div>
            </div>

            {/* 底部进入详情按钮 */}
            <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                就诊机构：{c.hospitalName}
              </span>
              <Link
                href={`/portal/cases/${c.slug}`}
                className="inline-flex items-center gap-1 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-xs font-semibold shadow-xs transition-colors"
              >
                <span>查看完整数字化方案与随访</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* 底部权威保障挂牌说明 */}
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-5 text-xs text-sky-900 space-y-2">
        <div className="font-bold text-sm text-sky-800 flex items-center gap-2">
          <span>🛡️</span>
          <span>齿科指南网 · 临床病例真实性公示准则</span>
        </div>
        <p className="leading-relaxed text-sky-800/80">
          所有上线案例均取得患者临床病例留档知情同意书，隐去面部非医疗辨识度隐私区域，杜绝商业盗图与网络拼贴。病例中的术前全景断层片、3D方案位移步数、耗材品牌与复诊周期均由云南松鼠口腔执业医疗团队审核验证。
        </p>
      </div>
    </div>
  );
}
