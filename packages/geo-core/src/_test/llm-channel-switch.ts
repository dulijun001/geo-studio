/**
 * LLM 多通道路由单测 — 验证「什么失败该换通道、什么失败不该换」。
 * Run: pnpm --filter @geo/geo-core exec tsx src/_test/llm-channel-switch.ts
 *
 * 这条边界是整个改造的核心:切多了 = 每次内容级失败都双倍烧钱;
 * 切少了 = 欠费时照样全站停摆(即改造无效)。用真实报错串做样本。
 */
import { isSwitchableFailure, channelStatus } from '../llm/chat';

type Case = { msg: string; expect: boolean; why: string };

const CASES: Case[] = [
  // ── 系统性失败:必须换通道 ──
  {
    msg: 'Ark 403: {"error":{"code":"AccountOverdueError","message":"The request failed because your account has an overdue balance.',
    expect: true,
    why: '火山方舟欠费 — 2026 年已发生 5 次,本次改造的首要目标',
  },
  { msg: 'Ark 401: invalid api key', expect: true, why: '认证失效,换通道可用' },
  { msg: 'Ark 429: rate limit exceeded', expect: true, why: '限流,换通道可用' },
  { msg: 'Ark 500: internal error', expect: true, why: '上游 5xx' },
  { msg: 'Ark 503: service unavailable', expect: true, why: '上游 5xx' },
  { msg: 'The operation was aborted', expect: true, why: 'AbortController 超时' },
  { msg: 'fetch failed', expect: true, why: '网络层失败' },
  { msg: 'connect ECONNREFUSED 127.0.0.1:443', expect: true, why: '连接被拒' },
  { msg: 'getaddrinfo ENOTFOUND ark.cn-beijing.volces.com', expect: true, why: 'DNS 解析失败' },
  { msg: 'Fallback 403: overdue', expect: true, why: '备用通道同类失败也应可识别(未来主备互换)' },

  // ── 内容级失败:不该换通道(换了也一样失败,纯浪费) ──
  {
    msg: 'LLM returned unparseable JSON',
    expect: false,
    why: 'D25 解析失败 — 由 generator 的 healing + retry 处理',
  },
  {
    msg: 'Ark 400: invalid request body',
    expect: false,
    why: '400 是请求本身有问题,换通道同样 400',
  },
  { msg: 'variant rejected by compliance gate', expect: false, why: '合规拦截,与通道无关' },
  { msg: 'model refused to answer', expect: false, why: '模型拒答,换通道大概率同样拒答' },
  { msg: 'DoD evaluation failed: title gate miss', expect: false, why: '质量闸门,与通道无关' },
];

let pass = 0;
for (const c of CASES) {
  const got = isSwitchableFailure(c.msg);
  const ok = got === c.expect;
  if (ok) pass++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  切换=${String(got).padEnd(5)} 期望=${String(c.expect).padEnd(5)} ${c.why}`,
  );
  if (!ok) console.log(`      样本: ${c.msg.slice(0, 90)}`);
}

console.log(`\n${pass}/${CASES.length} passed`);

const st = channelStatus();
console.log(
  `通道状态: 主通道(Ark)=${st.primary ? '已配置' : '未配置'} · 备用=${st.fallback ? '已配置' : '未配置'} (${st.fallbackTarget})`,
);

if (pass !== CASES.length) process.exit(1);
