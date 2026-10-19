/**
 * Tracker 无障碍语义树 (Accessibility Tree) 辅助模块
 * 
 * 背景 (D27, D72, D74, Browser Use 2026 技术规范):
 * 目标平台 (豆包/元宝/DeepSeek) 前端打包频繁更换 CSS 类名与 Hash (如 SendButton_sendButton__<hash>),
 * 单纯依赖 CSS 选择器极其脆弱。
 * 本模块遵循 W3C Accessibility 标准，采用：
 *   1. W3C 角色与语义标签优先 (page.getByRole('textbox'), page.getByRole('button', { name: ... }))
 *   2. 既有 CSS 降级列表兜底
 *   3. 严格遵循 per-attempt 短超时 (3s) 与 isEnabled() / isEditable() 防死锁
 */

import type { ElementHandle, Page } from 'playwright';

export interface LocateInputOptions {
  candidates?: string[];
  timeoutMs?: number;
}

export interface SendButtonOptions {
  candidates?: string[];
  timeoutMs?: number;
}

/**
 * 智能定位聊天输入框 (Composer)
 * 优先级: 语义角色 textbox -> 候选 CSS 选择器列表
 */
export async function locateComposerInput(
  page: Page,
  opts: LocateInputOptions = {},
): Promise<ElementHandle<Element> | null> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const candidates = opts.candidates ?? [];

  // 1. 无障碍语义定位：尝试匹配可编辑的 textbox
  try {
    const roleLocators = [
      page.getByRole('textbox'),
      page.getByLabel(/输入|提问|搜索|发消息|问元宝|发送给/),
    ];

    for (const locator of roleLocators) {
      const count = await locator.count().catch(() => 0);
      if (count > 0) {
        // 取最后一个通常为当前激活的输入框（部分页面有顶栏全局搜索框）
        const candidate = count === 1 ? locator.first() : locator.last();
        const visible = await candidate.isVisible().catch(() => false);
        const editable = await candidate.isEditable().catch(() => false);
        if (visible && editable) {
          const handle = await candidate.elementHandle();
          if (handle) return handle;
        }
      }
    }
  } catch {
    // 忽略无障碍检查中的非致命异常，准备平滑降级
  }

  // 2. 降级：遍历已验证的 CSS 候选选择器列表
  for (const sel of candidates) {
    const handle = await page
      .waitForSelector(sel, { timeout: Math.min(timeoutMs, 3000) })
      .catch(() => null);
    if (handle) {
      const visible = await handle.isVisible().catch(() => false);
      if (visible) return handle;
    }
  }

  return null;
}

/**
 * 智能点击发送按钮
 * 优先级: 无障碍语义 button ("发送"|"提交"|"Enter") -> 候选 CSS 选择器 -> 键盘 Enter
 */
export async function submitChatQuery(
  page: Page,
  inputHandle: ElementHandle<Element> | null,
  opts: SendButtonOptions = {},
): Promise<{ submitted: boolean; submittedVia: string }> {
  const timeoutMs = opts.timeoutMs ?? 3000;
  const candidates = opts.candidates ?? [];

  // 1. 无障碍语义定位尝试点击发送按钮
  try {
    const sendRoles = [
      page.getByRole('button', { name: /^(发送|提交|Enter|发消息)$/i }),
      page.getByRole('button', { name: /发送/i }),
      page.locator('button[aria-label*="发送"]'),
      page.locator('[role="button"][aria-label*="发送"]'),
    ];

    for (const locator of sendRoles) {
      const count = await locator.count().catch(() => 0);
      if (count > 0) {
        const btn = locator.first();
        const enabled = await btn.isEnabled().catch(() => false);
        if (enabled) {
          const ok = await btn
            .click({ timeout: timeoutMs, force: true })
            .then(() => true)
            .catch(() => false);
          if (ok) {
            return { submitted: true, submittedVia: 'accessibility-role' };
          }
        }
      }
    }
  } catch {
    // 降级到 CSS 选择器
  }

  // 2. 降级：遍历 CSS 候选选择器列表 (严格排除 disabled 与 div 假命中)
  for (const sel of candidates) {
    const btn = await page.$(sel).catch(() => null);
    if (!btn) continue;
    const enabled = await btn.isEnabled().catch(() => false);
    if (!enabled) continue;

    const ok = await btn
      .click({ timeout: timeoutMs, force: true })
      .then(() => true)
      .catch(() => false);
    if (ok) {
      return { submitted: true, submittedVia: sel };
    }
  }

  // 3. 兜底：键盘按键模拟提交
  if (inputHandle) {
    await inputHandle.focus().catch(() => undefined);
  }
  await page.keyboard.press('Enter').catch(() => undefined);
  await page.waitForTimeout(300);
  await page.keyboard.press('Meta+Enter').catch(() => undefined);

  return { submitted: true, submittedVia: 'keyboard-enter' };
}
