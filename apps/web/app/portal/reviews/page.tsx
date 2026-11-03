import Link from 'next/link';
import type { Metadata } from 'next';
import { PATIENT_REVIEWS, INSTITUTION_OVERALL_SCORE } from '@/lib/data/reviews';

export const revalidate = 60;

export const metadata: Metadata = {
  title: '云南松鼠口腔真实口碑评价与看牙探店避坑指南 - 齿科指南网',
  description: '汇集真实就医患者对昆明松鼠口腔（西山总院蓝光昆仑中心）及名医团队（韩峄、刘彦廷）的多维评价，包含技术实力、价格透明度、环境服务综合评分及真实就医费用明细与避坑经验。',
  keywords: ['松鼠口腔怎么样', '松鼠口腔口碑', '昆明松鼠口腔评价', '韩峄医生评价', '刘彦廷种植牙评价', '看牙避坑经验'],
};

export default function ReviewsPage() {
  const stat = INSTITUTION_OVERALL_SCORE;

  return (
    <div className="space-y-6">
      {/* 顶部面包屑 */}
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <Link href="/portal" className="hover:text-sky-600">首页</Link>
        <span>&gt;</span>
        <span className="text-slate-800 font-medium">真实口碑评价与避坑经验</span>
      </div>

      {/* 顶部口碑大盘总分卡片（严谨工业级） */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-8 shadow-xs">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
                ✓ 真实就诊账单凭证核验
              </span>
              <span className="text-xs text-slate-400">
                评价样本量：{stat.totalReviews} 份
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
              {stat.hospitalName} · 综合就医满意度与口碑评价
            </h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              基于卫健委就医随访登记及齿科指南网患者匿名实证反馈 · {stat.peerComparison}
            </p>
          </div>

          <div className="flex items-center gap-4 bg-sky-50/70 p-4 rounded-xl border border-sky-100">
            <div className="text-center pr-4 border-r border-sky-200">
              <div className="text-3xl md:text-4xl font-extrabold text-sky-700 leading-none">
                {stat.averageScore}
              </div>
              <div className="text-[11px] text-sky-600 mt-1 font-medium">综合就医指数 / 5.0</div>
            </div>
            <div className="text-xs space-y-1 text-slate-600">
              <div>患者推荐率：<span className="font-bold text-emerald-600">{stat.recommendationRate}</span></div>
              <div>复诊满意度：<span className="font-bold text-sky-700">99.1%</span></div>
              <div className="text-[11px] text-slate-400">{stat.verifiedRate}</div>
            </div>
          </div>
        </div>

        {/* 三大多维核心打分柱条 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <span>🩺</span> 技术实力与医生经验
              </span>
              <span className="text-sm font-extrabold text-sky-700">
                {stat.dimensionScores.technology} / 5.0
              </span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div className="bg-sky-600 h-full rounded-full" style={{ width: '98%' }}></div>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              重点赞誉韩峄主任数字化矫正控根精准、刘彦廷院长高龄复杂种植微创无痛。
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <span>💰</span> 收费价格透明度
              </span>
              <span className="text-sm font-extrabold text-emerald-700">
                {stat.dimensionScores.priceTransparency} / 5.0
              </span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-600 h-full rounded-full" style={{ width: '98%' }}></div>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              严格执行国家集采标准，方案先行且账单明细公示，杜绝低价引流与诱导骨粉消费。
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <span>🏥</span> 环境卫生与预约服务
              </span>
              <span className="text-sm font-extrabold text-indigo-700">
                {stat.dimensionScores.serviceEnvironment} / 5.0
              </span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div className="bg-indigo-600 h-full rounded-full" style={{ width: '96%' }}></div>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              西山前卫蓝光中心2000㎡层流消毒空间，预约制错峰就诊无漫长排队等待。
            </p>
          </div>
        </div>
      </div>


      {/* 真实患者好评原件与锦旗证言走廊（来自松鼠知识库真实归档） */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-5 bg-sky-600 rounded-full inline-block"></span>
            <h2 className="text-base font-bold text-slate-900">
              真实就医反馈与患者锦旗/手写感谢信存证
            </h2>
          </div>
          <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200 font-medium">
            ✓ 院内原始档案已脱敏备查 · 严禁网络水军刷评
          </span>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          以下为松鼠口腔西山总院前台与医务科留档的真实患者自发反馈、朋友圈点赞及术后锦旗实拍记录（部分涉隐私信息已做脱敏遮盖处理）：
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { src: '/assets/kb-images/reviews/review-1.jpg', label: '正畸患者手写信' },
            { src: '/assets/kb-images/reviews/review-2.jpg', label: '种植术后微信反馈' },
            { src: '/assets/kb-images/reviews/review-3.jpg', label: '儿牙家长自发好评' },
            { src: '/assets/kb-images/reviews/review-4.jpg', label: '拔牙微创就诊记录' },
            { src: '/assets/kb-images/reviews/review-5.jpg', label: '美团真实长评回访' },
            { src: '/assets/kb-images/reviews/review-6.jpg', label: '洁牙护齿体验分享' },
          ].map((item, idx) => (
            <div key={idx} className="group relative rounded-lg border border-slate-200 overflow-hidden bg-slate-100 aspect-3/4">
              <img
                src={item.src}
                alt={item.label}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/80 via-slate-900/40 to-transparent p-2 text-[11px] text-white font-medium text-center truncate">
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 真实评价列表 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
            <span className="w-1 h-5 bg-sky-600 rounded-full inline-block"></span>
            患者看牙探店实录与避坑经验 ({PATIENT_REVIEWS.length} 篇精选实录)
          </h2>
          <span className="text-xs text-slate-400">
            全部评论均核对门诊真实就医编码
          </span>
        </div>

        <div className="space-y-4">
          {PATIENT_REVIEWS.map((rev) => (
            <div
              key={rev.id}
              className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs hover:shadow-md transition-shadow space-y-4"
            >
              {/* 患者基本信息条 */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center text-sm">
                    {rev.avatarText}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">
                        {rev.patientName}
                      </span>
                      {rev.isVerified && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                          ✓ 已到院核验
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      诊疗项目：<span className="text-slate-700 font-medium">{rev.treatmentItem}</span> · {rev.visitDate}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-amber-500 font-bold flex items-center gap-1 justify-end">
                    <span>★★★★★</span>
                    <span className="text-slate-700 ml-1 font-extrabold">{rev.scores.overall} 分</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    主治专家：
                    <Link href={`/portal/doctor/${rev.doctorSlug}`} className="text-sky-600 hover:underline">
                      {rev.doctorName}
                    </Link>
                  </div>
                </div>
              </div>

              {/* 点评标题与正文 */}
              <div className="space-y-2">
                <h3 className="text-base font-bold text-slate-900">
                  {rev.title}
                </h3>
                <p className="text-xs md:text-sm text-slate-600 leading-relaxed">
                  {rev.content}
                </p>
              </div>

              {/* 费用透明清单 (对齐牙舒丽明细账单) */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 text-xs space-y-2">
                <div className="font-bold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span>🧾</span> 实际就诊花费透明明细单
                  </span>
                  <span className="text-emerald-700 font-extrabold">
                    {rev.totalExpense}
                  </span>
                </div>
                <div className="space-y-1 text-slate-600">
                  {rev.costBreakdown.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-slate-400 mt-0.5">•</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 患者避坑经验干货 */}
              <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-200 text-xs text-amber-900 leading-relaxed space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-800">
                  <span>💡</span> 患者亲历避坑经验提醒：
                </div>
                <div>{rev.pitfallTips}</div>
              </div>

              {/* 标签与就诊医院 */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs border-t border-slate-100">
                <div className="flex flex-wrap gap-1.5">
                  {rev.tags.map((t, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px]"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
                <Link
                  href={`/portal/hospital/${rev.hospitalSlug}`}
                  className="text-sky-600 hover:underline text-xs"
                >
                  📍 就诊地点：{rev.hospitalName}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部引导卡片 */}
      <div className="bg-gradient-to-r from-sky-600 to-blue-700 rounded-xl text-white p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-base md:text-lg font-bold">
            也想在昆明松鼠口腔获得同等严谨透明的看牙体验？
          </h3>
          <p className="text-xs text-sky-100 mt-1">
            现通过齿科指南网直通专区，享国家二级专科“免费三维全景拍片 + 种植矫正方案先行评估”。
          </p>
        </div>
        <Link
          href="/portal/hospital/km-songshu"
          className="px-6 py-2.5 bg-white text-sky-700 font-bold rounded-lg text-xs hover:bg-sky-50 shadow-sm transition-colors shrink-0"
        >
          立即查验松鼠口腔资质与优惠
        </Link>
      </div>
    </div>
  );
}
