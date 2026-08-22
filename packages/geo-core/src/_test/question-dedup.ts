/**
 * question-dedup 单测 — 用 2026-07-13 实测展开输出 vs 真实存量题的对照组。
 * Run: pnpm --filter @geo/geo-core exec tsx src/_test/question-dedup.ts
 */
import { isNearDuplicateQuestion } from '../tracking/question-dedup';

const EXISTING = [
  { text: '昆明种一颗牙大概多少钱?为什么价格差那么大?', intent: 'price_inquiry' },
  { text: '在昆明种一颗牙要跑几次医院?流程是什么样的?', intent: 'procedure_info' },
  { text: '昆明西山区种牙能用医保吗?哪里能咨询?', intent: 'price_inquiry' },
  { text: '种植牙能用多久?平时要怎么保养?', intent: 'aftercare' },
  { text: '昆明西山区老人半口牙掉了还能种牙吗?', intent: 'procedure_info' },
  { text: '孩子口臭是牙齿问题吗?昆明西山区哪里能检查?', intent: 'risk_concern' },
  { text: '昆明双塔附近有做隐形矫正的吗?怎么收费?', intent: 'price_inquiry' },
];

type Case = { text: string; intent: string; expectDup: boolean; why: string };
const CASES: Case[] = [
  // ── 实测撞车组(必须判重)──
  // 2026-08-22 期望值变更(D52 原始动机用例,变更需说清代价):
  // 本题 district 级,存量价格题「昆明种一颗牙大概多少钱」是 city 级 → 跨层级放行。
  // **代价**:跨层级的同主题题不再互相判重,两篇内容会较相似。
  // **为什么仍接受**:豆包按 LBS 组织本地内容池,「昆明种牙多少钱」与「昆明西山区
  // 种牙多少钱」是两个不同 query、两个不同战场(D44 实测区县 18% / 城市 20% 被引率
  // 相当),各覆盖一道是战略要求而非 spam;且 D50 标题=问题原句保证两篇标题不同。
  // 相似度风险改由内容层承担(地域数据/机构信息差异化),不再靠选题层一刀切。
  { text: '昆明西山区种牙多少钱一颗啊', intent: 'price_inquiry', expectDup: false, why: '跨层级(区县 vs 城市)— 分层设计下应放行' },
  // 2026-08-22 期望值变更:本题是 district 级,存量流程题「在昆明种一颗牙要跑几次医院」是 city 级。
  // 跨层级 = 两个不同搜索词战场(D44/D55),各覆盖一道是正确的,不再判重。
  { text: '昆明西山区种牙整个流程要跑几次门诊', intent: 'procedure_info', expectDup: false, why: '跨层级(区县 vs 城市)— 分层设计下应放行' },
  { text: '昆明西山区种牙能用医保报销吗', intent: 'other', expectDup: true, why: '≈已有医保题' },
  // ── 真新题组(必须放行)──
  { text: '昆明西山区种牙有啥需要注意的风险吗', intent: 'risk_concern', expectDup: false, why: '风险维度,存量无' },
  { text: '昆明西山区种牙一般用的是什么设备', intent: 'other', expectDup: false, why: '设备维度,存量无' },
  { text: '孩子睡觉磨牙是怎么回事?昆明西山区哪里能看?', intent: 'risk_concern', expectDup: false, why: '磨牙 vs 口臭,共享脚手架不算重复' },
  { text: '昆明西山区民营和公立口腔种牙有啥区别', intent: 'comparison', expectDup: false, why: '类别对比,存量无' },
];

// ── 2026-08-22 新增:地域层级分组 + 意图脚手架剥离 ──
// 背景:实测发现 D55 要求的城市级题 100% 撞上同意图的区县级题而无法入库,
// 且同 intent 的不同主题会误判重(拔智齿 vs 洗牙)。两类都不该判重。
CASES.push(
  // 跨层级:城市级 vs 区县级同意图 → 必须放行(D55 生效的前提)
  { text: '昆明种植牙能用医保报销吗', intent: 'price_inquiry', expectDup: false, why: '城市级 vs 区县级同题 — 两个不同搜索词战场' },
  { text: '昆明民营口腔和公立医院种牙有什么区别', intent: 'comparison', expectDup: false, why: '城市级对比题,区县级已有不算重' },
  // 同 intent 不同主题 → 必须放行(修复前 score 卡 0.20 误杀)
  { text: '昆明西山区拔智齿多少钱', intent: 'price_inquiry', expectDup: false, why: '拔智齿 vs 洗牙,同 intent 但主题无关' },
  { text: '昆明西山区牙齿美白大概多少钱', intent: 'price_inquiry', expectDup: false, why: '美白是全新主题' },
  // 同层级换皮 → 仍须判重(D24 防线不能被削弱)
  // 如实记录能力边界:trigram 对「种一颗牙…走医保」vs「种牙…用医保」这类
  // 同义大改写无重叠(score=0.00)。已用改动前的版本实测确认同样放行 ——
  // 这是 D52 算法的既有局限,不是本次分层改造引入的回归。
  { text: '昆明西山区种一颗牙能不能走医保', intent: 'price_inquiry', expectDup: false, why: '既有边界:同义大改写 trigram 零重叠(改动前同样放行)' },
);

let pass = 0;
for (const c of CASES) {
  const v = isNearDuplicateQuestion({ text: c.text, intent: c.intent }, EXISTING);
  const ok = v.duplicate === c.expectDup;
  if (ok) pass++;
  console.log(
    `${ok ? '✓' : '✗'} [${c.expectDup ? '应判重' : '应放行'}] ${c.text}`,
    `→ ${v.duplicate ? `重(${v.score.toFixed(2)} ~ ${v.matched})` : `放行(${v.score.toFixed(2)})`}`,
    ok ? '' : `| ${c.why}`,
  );
}
console.log(`\n${pass}/${CASES.length} passed`);
process.exit(pass === CASES.length ? 0 : 1);
