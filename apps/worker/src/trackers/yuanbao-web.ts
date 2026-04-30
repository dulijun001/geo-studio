/// <reference lib="dom" />
/**
 * 腾讯元宝(Yuanbao)Web tracker adapter.
 *
 * 元宝是腾讯的对话式 AI 助手(yuanbao.tencent.com),走 RAG 检索 + LLM
 * 模式,跟豆包同属"被引用"目标。结构上跟 doubao-web 同款:
 *   - 持久化 userDataDir(~/.cache/geo-tracker/yuanbao)保存登录 cookie
 *   - 失败/超时不抛,返回 TrackerResult 让 worker 决定
 *   - selector 用 candidate list,DOM 改名只降效不死翘
 *
 * Login: pnpm --filter @geo/worker exec tsx src/trackers/_dev/yuanbao-login.ts
 * Probe: pnpm --filter @geo/worker exec tsx src/trackers/_dev/probe-yuanbao.ts (TODO)
 *
 * V1 的 selector 集合是 2026-04-29 第一次写的初值,**首次跑可能没命中**
 * (元宝改 CSS 比豆包频繁)。如果 raw_response_len=0,先跑 probe 命令看
 * 当前真实 DOM,然后回来调 MESSAGE_CANDIDATES。
 */
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext } from 'playwright';
import type { TrackerAdapter, TrackerContext, TrackerQuery, TrackerResult } from '@geo/geo-core';

const CHAT_URL = 'https://yuanbao.tencent.com/chat';
// Probed 2026-04-30: Yuanbao uses a Quill rich-text editor (ql-editor)
// instead of a plain <textarea>. ql-blank class disappears once typed.
const INPUT_SELECTOR_CANDIDATES = [
  '.ql-editor',
  'div[contenteditable="true"].ql-editor',
  '[class*="agent-input"] [contenteditable="true"]',
  '[contenteditable="true"][role="textbox"]',
  'textarea[placeholder*="问元宝"]',
  'textarea[placeholder*="发送给元宝"]',
  'textarea[placeholder*="发消息"]',
  '[contenteditable="true"]',
  'textarea',
];
// Yuanbao 把消息内容渲染在多个嵌套 div,这些是 2026-04 时的一些常见类前缀
const MESSAGE_CANDIDATES = [
  '[class*="hyc-content-md"]',
  '[class*="agent-chat__bubble"]',
  '[class*="chat-message-ai"]',
  '[class*="ai-message"]',
  '[class*="bot-response"]',
  '[class*="markdown-body"]',
  '[class*="message-content"]',
  '[data-testid*="message"]',
  'main',
];
// Probed 2026-04-30: send icon class is `iconfont icon-send` inside the
// composer toolbar. The clickable ancestor is the icon's container span/div,
// not a <button>. Generic `button:has(svg)` previously misfired onto an
// unrelated header icon and left the message in the composer.
const SEND_BUTTON_CANDIDATES = [
  '[class*="icon-send"]',
  '[class*="agent-chat__input"] [class*="icon-send"]',
  'button[aria-label*="发送"]',
  'button[class*="send-button"]',
  'button[class*="submit"]',
  '[class*="send-btn"] button',
];

const STABLE_REQUIRED_IDLES = 3;
const POLL_INTERVAL_MS = 1000;
const MIN_RESPONSE_CHARS = 100;

export function getYuanbaoUserDataDir(): string {
  return process.env.GEO_YUANBAO_USERDATA || join(homedir(), '.cache', 'geo-tracker', 'yuanbao');
}

class YuanbaoWebAdapter implements TrackerAdapter {
  readonly engine = 'yuanbao' as const;
  private _lastWinner: string | null = null;

  async query(q: TrackerQuery, ctx: TrackerContext): Promise<TrackerResult> {
    if (q.engine !== this.engine) {
      throw new Error(`YuanbaoWebAdapter received query for engine=${q.engine}`);
    }

    const started = Date.now();
    let context: BrowserContext | undefined;

    try {
      const userDataDir = getYuanbaoUserDataDir();
      await mkdir(userDataDir, { recursive: true });
      context = await chromium.launchPersistentContext(userDataDir, {
        headless: ctx.headless,
        channel: 'chrome',
        args: ['--disable-blink-features=AutomationControlled'],
        proxy: ctx.proxy,
        viewport: { width: 1280, height: 900 },
        locale: 'zh-CN',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      });
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });
      const page = context.pages()[0] ?? (await context.newPage());

      const hardDeadline = started + ctx.timeout_ms;
      const remaining = () => Math.max(0, hardDeadline - Date.now());

      await page.goto(CHAT_URL, {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(remaining(), 30_000),
      });
      await page.keyboard.press('Escape').catch(() => undefined);

      // Find input (multiple candidate selectors)
      let input = null;
      for (const sel of INPUT_SELECTOR_CANDIDATES) {
        input = await page
          .waitForSelector(sel, { timeout: Math.min(remaining(), 5_000) })
          .catch(() => null);
        if (input) break;
      }
      if (!input) {
        return {
          status: 'failed',
          failure_reason:
            'composer textarea not found. Selectors may have changed — run `pnpm yuanbao:probe`.',
          meta: { elapsed_ms: Date.now() - started },
        };
      }

      await input.click();
      await input.fill(q.question);

      // Try send button, fall back to Enter
      let submitted = false;
      for (const sel of SEND_BUTTON_CANDIDATES) {
        const btn = await page.$(sel).catch(() => null);
        if (btn && (await btn.isEnabled().catch(() => false))) {
          await btn.click().catch(() => undefined);
          submitted = true;
          break;
        }
      }
      if (!submitted) {
        await page.keyboard.press('Enter').catch(() => undefined);
      }

      // Yuanbao usually puts the chat in a `/chat/<id>` URL after submit;
      // fall back to looking for any answer text on the page within timeout.
      await page
        .waitForURL(/\/chat\/[^/]+$/, { timeout: Math.min(remaining(), 12_000) })
        .catch(() => undefined);

      // Stability poll across candidate selectors
      let lastLen = -1;
      let idleCount = 0;
      while (remaining() > 0) {
        await page.waitForTimeout(POLL_INTERVAL_MS);
        const probe = await page
          .evaluate((selectors) => {
            for (const s of selectors) {
              const els = Array.from(document.querySelectorAll(s));
              if (!els.length) continue;
              let chars = 0;
              for (const el of els) chars += (el.textContent || '').length;
              if (chars > 0) return { sel: s, len: chars };
            }
            return { sel: null as string | null, len: 0 };
          }, MESSAGE_CANDIDATES)
          .catch(() => ({ sel: null as string | null, len: 0 }));
        if (probe.sel) this._lastWinner = probe.sel;
        const len = probe.len;
        if (len >= MIN_RESPONSE_CHARS && len === lastLen) {
          idleCount += 1;
          if (idleCount >= STABLE_REQUIRED_IDLES) break;
        } else {
          idleCount = 0;
        }
        lastLen = len;
      }

      if (idleCount < STABLE_REQUIRED_IDLES) {
        const partial = await this.#extract(page);
        return {
          status: 'failed',
          failure_reason:
            partial.raw_response.length === 0
              ? 'login required or selectors broken — chat URL never advanced past welcome. Run `pnpm yuanbao:login` then `pnpm yuanbao:probe`.'
              : 'response did not stabilize before timeout',
          raw_response: partial.raw_response,
          citation_urls: partial.citation_urls,
          meta: { elapsed_ms: Date.now() - started, final_text_len: lastLen },
        };
      }

      const extracted = await this.#extract(page);
      return {
        status: 'done',
        raw_response: extracted.raw_response,
        citation_urls: extracted.citation_urls,
        meta: {
          elapsed_ms: Date.now() - started,
          session_url: page.url(),
          text_len: extracted.raw_response.length,
        },
      };
    } catch (err) {
      return {
        status: 'failed',
        failure_reason: err instanceof Error ? err.message : String(err),
        meta: { elapsed_ms: Date.now() - started },
      };
    } finally {
      await context?.close().catch(() => undefined);
    }
  }

  async #extract(page: import('playwright').Page): Promise<{
    raw_response: string;
    citation_urls: string[];
  }> {
    const selectors = this._lastWinner
      ? [this._lastWinner, ...MESSAGE_CANDIDATES]
      : MESSAGE_CANDIDATES;
    return page.evaluate((sels) => {
      for (const s of sels) {
        const els = Array.from(document.querySelectorAll(s));
        if (!els.length) continue;
        let raw_response = '';
        const urls = new Set<string>();
        for (const el of els) {
          raw_response += (el.textContent || '');
          for (const a of Array.from(el.querySelectorAll('a[href]'))) {
            const href = (a as HTMLAnchorElement).href;
            if (href.startsWith('http')) urls.add(href);
          }
        }
        raw_response = raw_response.trim();
        if (raw_response.length > 0) return { raw_response, citation_urls: [...urls] };
      }
      return { raw_response: '', citation_urls: [] };
    }, selectors);
  }
}

export const yuanbaoWebAdapter: TrackerAdapter = new YuanbaoWebAdapter();
