import Link from 'next/link';
import type { Metadata } from 'next';
import { CLINICAL_CASES } from '@/lib/data/cases';

export const revalidate = 60;

export const metadata: Metadata = {
  title: '真实口腔临床案例库_种植牙/牙齿矫正/美学修复前后量化对比 - 齿科指南网',
  description: '汇集昆明正规口腔专科真实临床脱敏案例，涵盖青少年地包天、成人隐适美内收、全口All-on-4即刻负重、前牙即刻种植及超薄瓷贴面，含三维指标对比与长期随访。',
};

const CATEGORIES = ['全部案例', '种植牙', '牙齿矫正', '美学修复'] as const;

export default function CasesPage({
  searchParams,
}: {
  searchParams?: { category?: string };
}) {
  const currentCategory = searchParams?.category || '全部案例';

  const filteredCases = currentCategory === '全部案例'
    ? CLINICAL_CASES
    : CLINICAL_CASES.filter((c) => c.category === currentCategory);

  return (
    <div className="space-y-6">
      {/* 顶部面包屑 */}
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <Link href="/portal" className="hover:text-sky-600 transition-colors">首页</Link>
        <span>&gt;</span>
        <span className="text-slate-800 font-medium">真实临床案例库</span>
      </div>

      {/* 栏目头部介绍 */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 md:p-8 shadow-xs space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-800 text-xs font-semibold border border-sky-200">
          <span>🩺 循证医学 · 数字化量化评估</span>
        </div>
        <h1 className="text-xl md:text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">
          昆明正规口腔临床案例方案库
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-3xl">
          每一个成功案例，都是严谨生物力学与数字化三维方案的结晶。本专区精选松鼠口腔西山总院等正规机构主治以上专家（韩峄主任、刘彦廷院长团队）真实脱敏临床案例，拒绝过度夸大宣传，呈现治疗前后客观量化指标、详细方案步骤与远期随访稳定性。
        </p>
      </div>

      {/* 分类筛选 Tab */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map((cat) => {
          const isActive = currentCategory === cat;
          const href = cat === '全部案例' ? '/portal/cases' : `/portal/cases?category=${encodeURIComponent(cat)}`;
          return (
            <Link
              key={cat}
              href={href}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {cat}
            </Link>
          );
        })}
      </div>

      {/* 案例列表 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredCases.map((c) => (
          <div
            key={c.slug}
            className="bg-white rounded-xl border border-slate-200/90 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden group"
          >
            <div>
              {/* 案例头部标签条 */}
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 font-semibold">
                    {c.category}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                    c.difficulty === '高难度' || c.difficulty === '微创疑难'
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
                    <span className="font-semibold text-slate-700">患者临床分群：</span>
                    {c.patientAge}
                  </div>
                  <div className="text-slate-700 leading-relaxed">
                    <span className="font-semibold text-rose-600">【就诊主诉】</span>
                    {c.chiefComplaint}
                  </div>
                </div>

                {/* 治疗前后量化指标缩略展示 */}
                <div className="border border-slate-200/80 rounded-lg overflow-hidden text-xs">
                  <div className="bg-slate-100/80 px-3 py-1.5 font-semibold text-slate-700 border-b border-slate-200 flex justify-between">
                    <span>核心指标量化蜕变</span>
                    <span className="text-[11px] text-emerald-700 font-normal">三维数字追踪</span>
                  </div>
                  <div className="p-3 bg-white space-y-1.5">
                    {c.keyMetrics.slice(0, 2).map((m, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">{m.label}</span>
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="text-rose-600 line-through">{m.before.split(' ')[0]}</span>
                          <span className="text-slate-300">➔</span>
                          <span className="text-emerald-700 font-bold">{m.after.split(' ')[0]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 主刀医生及机构 */}
                <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center text-sm shrink-0">
                      👨‍⚕️
                    </div>
                    <div>
                      <Link
                        href={c.doctorSlug ? `/portal/doctor/${c.doctorSlug}` : '/portal/doctor'}
                        className="font-bold text-slate-900 hover:text-sky-600"
                      >
                        {c.doctorName}
                      </Link>
                      <span className="text-slate-400 ml-1.5 text-[11px]">（{c.doctorTitle.split('/')[0]}）</span>
                    </div>
                  </div>
                  <div className="text-sky-700 font-medium text-[11px] bg-sky-50 px-2 py-0.5 rounded">
                    {c.materials.split('+')[0]?.trim() || ''}
                  </div>
                </div>
              </div>
            </div>

            {/* 底部进入详情按钮 */}
            <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                就诊机构：{c.institution}
              </span>
              <Link
                href={`/portal/cases/${c.slug}`}
                className="inline-flex items-center gap-1 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
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
          <span>临床病例展示知情同意与医学合规说明</span>
        </div>
        <p className="text-slate-600 leading-relaxed">
          本站所展示之全部口腔临床案例，均严格遵循国家《病历书写基本规范》与松鼠医疗内容合规标准，已对患者姓名、肖像、身份证件及住址执行严格 L1 级教学脱敏处理。案例呈现仅用于口腔健康医学科普与治疗方案参考，不同个体牙槽骨密度、牙周基础及依从性存在差异，具体方案需以主治医生面对面视诊及全景 CBCT 检查为准。
        </p>
      </div>
    </div>
  );
}
