/**
 * LLM 通道路由 —— 主通道(火山方舟 Ark)失败时自动切备用通道。
 *
 * 背景:火山方舟 2026 年 4-8 月共欠费停摆 5 次。原来 `chat()` 直连 Ark,
 * 欠费即全站内容生产停摆,无绕过路径。D49 已让 worker 对系统性失败做 job
 * 重试(充值后自动续跑),但「充值前这段时间完全出不了活」的问题没解。
 * 本层补上这一环:欠费/限流/网关故障 → 当次调用直接换通道产出结果。
 *
 * 关键设计:只对「系统性失败」切换,不对「内容级失败」切换。
 *   - 系统性:欠费 403 / 认证 401 / 限流 429 / 5xx / 超时 / DNS / 连接失败
 *     → 换一家就能好,值得切。
 *   - 内容级:模型拒答、返回不可解析 JSON、生成质量不合格
 *     → 换一家大概率同样失败,切了只是双倍烧钱。这类由上层既有的
 *       retry/healing 逻辑处理(见 D25 generator.parseResponse)。
 *
 * 切换是**每次调用独立判断**,不做进程级熔断状态:worker 与 web 是多进程,
 * 进程内状态既不共享也会随重启丢失,徒增不可预测性。Ark 恢复后第一次调用
 * 自然回到主通道,无需人工复位。
 */

import { arkAvailable, arkChat, type ChatOptions, type ChatResult } from './provider-ark';
import { fallbackAvailable, fallbackChat, fallbackDescribe } from './provider-openai';

export type { ChatMessage, ChatOptions, ChatResult } from './provider-ark';
export { fallbackDescribe };

/**
 * 值得换通道重试的失败。与 apps/worker/src/jobs/variant-generate.ts 的
 * SYSTEMIC_LLM_FAILURE_RE 同源(D49),这里额外收 Fallback 前缀以便未来
 * 主备互换时语义不变。
 */
const SWITCHABLE_RE =
  /(Ark|Fallback) (400|401|403|429|5\d\d)|InvalidEndpoint|ClosedEndpoint|[Oo]verdue|timed? ?out|ECONN|ENOTFOUND|EAI_AGAIN|fetch failed|aborted|The operation was aborted/i;

export function isSwitchableFailure(message: string): boolean {
  return SWITCHABLE_RE.test(message);
}

/** 至少有一条可用通道。调用方沿用原来的 isAvailable() 语义。 */
export function isAvailable(): boolean {
  return arkAvailable() || fallbackAvailable();
}

/** 供诊断/早报使用的通道状态。 */
export function channelStatus(): { primary: boolean; fallback: boolean; fallbackTarget: string } {
  return {
    primary: arkAvailable(),
    fallback: fallbackAvailable(),
    fallbackTarget: fallbackDescribe(),
  };
}

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  const hasPrimary = arkAvailable();
  const hasFallback = fallbackAvailable();

  if (!hasPrimary && !hasFallback) {
    throw new Error(
      'No LLM channel configured — set ARK_API_KEY, or LLM_FALLBACK_API_KEY + LLM_FALLBACK_BASE_URL',
    );
  }

  // 主通道没配 key:直接走备用,不产生一次必然失败的请求。
  if (!hasPrimary) {
    console.warn('[llm] ARK_API_KEY 未配置,直接使用备用通道');
    return fallbackChat(opts);
  }

  try {
    return await arkChat(opts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (!hasFallback) {
      // 备用通道没配 —— 保持原样抛出,行为与改造前一致,上层 D49 重试逻辑照旧。
      throw err;
    }
    if (!isSwitchableFailure(message)) {
      // 内容级失败:换通道无益,交给上层既有的解析修复 / 重试路径。
      throw err;
    }

    console.warn(
      `[llm] 主通道(Ark)系统性失败,切备用通道 [${fallbackDescribe()}] — 原因: ${message.slice(0, 160)}`,
    );
    try {
      return await fallbackChat(opts);
    } catch (fallbackErr) {
      const fbMessage = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      // 两条通道都挂:把两个原因都带上,否则排查时只看得到第二个,
      // 会误判成「备用通道配错了」而漏掉主通道欠费这个真因。
      throw new Error(`LLM 全通道失败 — 主(Ark): ${message} | 备用: ${fbMessage}`);
    }
  }
}
