/**
 * 企业微信群机器人告警 (C4, 2026-09-01)。
 *
 * 背景:此前所有告警只走 SMTP(mailer.ts),而 SMTP 从未配置 → 每封都 drop;
 * Sentry 依赖也没装。结果火山方舟欠费停产 6 天无人察觉。此模块提供一条真正
 * 能触达用户手机的出口:企业微信群机器人 webhook。
 *
 * 设计:
 *   - 读 WECOM_WEBHOOK_URL,未配则静默 no-op(与改造前行为一致,不报错)。
 *   - 永不 throw:告警发送失败只在 console 记一行,绝不影响调用方主流程
 *     (告警挂掉不能反过来搞垮业务)。
 *   - markdown 消息,带标题。
 */

export async function notifyWeCom(title: string, body: string): Promise<boolean> {
  const url = process.env.WECOM_WEBHOOK_URL;
  if (!url) return false;

  const content = `**${title}**\n${body}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'markdown', markdown: { content } }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    const json = (await res.json().catch(() => ({}))) as { errcode?: number; errmsg?: string };
    if (json.errcode !== 0) {
      console.error(`[wecom] 推送失败: errcode=${json.errcode} ${json.errmsg ?? ''}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[wecom] 推送异常:', err);
    return false;
  }
}
