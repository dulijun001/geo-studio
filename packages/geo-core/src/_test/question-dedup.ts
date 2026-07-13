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
  { text: '昆明西山区种牙多少钱一颗啊', intent: 'price_inquiry', expectDup: true, why: '≈已有价格题' },
  { text: '昆明西山区种牙整个流程要跑几次门诊', intent: 'procedure_info', expectDup: true, why: '≈已有流程题' },
  { text: '昆明西山区种牙能用医保报销吗', intent: 'other', expectDup: true, why: '≈已有医保题' },
  // ── 真新题组(必须放行)──
  { text: '昆明西山区种牙有啥需要注意的风险吗', intent: 'risk_concern', expectDup: false, why: '风险维度,存量无' },
  { text: '昆明西山区种牙一般用的是什么设备', intent: 'other', expectDup: false, why: '设备维度,存量无' },
  { text: '孩子睡觉磨牙是怎么回事?昆明西山区哪里能看?', intent: 'risk_concern', expectDup: false, why: '磨牙 vs 口臭,共享脚手架不算重复' },
  { text: '昆明西山区民营和公立口腔种牙有啥区别', intent: 'comparison', expectDup: false, why: '类别对比,存量无' },
];

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
