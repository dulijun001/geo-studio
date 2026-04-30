/// <reference lib="dom" />
/**
 * DeepSeek Web tracker adapter.
 *
 * 站点 chat.deepseek.com — 同款"被 GEO 引用"目标。
 *
 * 关键特性(与豆包/元宝差异):
 *   - DeepSeek 默认走纯 LLM 不联网。必须显式打开「联网搜索」按钮才能进入
 *     RAG 模式 — 不开等于裸 LLM,跟豆包 API 一样无意义(违反 D4)。
 *     adapter 在每次 query 前主动 enable 搜索开关。
 *   - 引用通常是 `[citation:n]` 行内标记 + 底部「参考资料」列表带原始 URL
 *   - DOM 用 React Tailwind/CSS module,首次 selector 命中率比豆包略高,
 *     但仍需要走候选列表
 *
 * Login: pnpm --filter @geo/worker exec tsx src/trackers/_dev/deepseek-login.ts
 * Probe: pnpm --filter @geo/worker exec tsx src/trackers/_dev/probe-deepseek.ts
 *
 * V1 selector 是 2026-04-30 第一次写,**首次跑很可能没命中**,务必先跑
 * probe 看真实 DOM 再调 MESSAGE_CANDIDATES / SEARCH_TOGGLE_CANDIDATES。
 */
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext } from 'playwright';
import type { TrackerAdapter, TrackerContext, TrackerQuery, TrackerResult } from '@geo/geo-core';

const CHAT_URL = 'https://chat.deepseek.com/';

const INPUT_SELECTOR_CANDIDATES = [
  'textarea[placeholder*="问"]',
  'textarea[placeholder*="发送"]',
  'textarea[placeholder*="DeepSeek"]',
  'textarea#chat-input',
  'textarea',
  '[contenteditable="true"][role="textbox"]',
];

// "联网搜索" toggle. Most likely a button with text "联网搜索" or icon button
// with aria-label. We click it once to flip on; idempotent guard checks
// aria-pressed / class containing "active" before clicking again.
const SEARCH_TOGGLE_CANDIDATES = [
  'button:has-text("联网搜索")',
  'button[aria-label*="联网"]',
  '[role="button"]:has-text("联网搜索")',
  'button:has-text("Web Search")',
];

// Send button candidates — DeepSeek uses an arrow-up SVG button next to input.
const SEND_BUTTON_CANDIDATES = [
  'button[aria-label*="发送"]',
  'button[aria-label*="Send"]',
  'div[role="button"][aria-label*="发送"]',
  'button:has(svg) ~ *', // last resort: any button with svg adjacent to textarea
];

// Answer container candidates. DeepSeek usually wraps each turn in a div
// with role="article" or a chat-message class. The whole conversation lives
// in a scroll container.
const MESSAGE_CANDIDATES = [
  '[class*="ds-markdown"]',          // observed: DeepSeek markdown wrapper
  '[class*="markdown-body"]',
  '[role="article"]',
  '[class*="message-content"]',
  '[class*="chat-message"]',
  '[class*="answer"]',
  '[data-testid*="message"]',
  'main',
];

const STABLE_REQUIRED_IDLES = 3;
const POLL_INTERVAL_MS = 1000;
const MIN_RESPONSE_CHARS = 100;

export function getDeepseekUserDataDir(): string {
  return process.env.GEO_DEEPSEEK_USERDATA || join(homedir(), '.cache', 'geo-tracker', 'deepseek');
}

class DeepseekWebAdapter implements TrackerAdapter {
  readonly engine = 'deepseek' as const;
  private _lastWinner: string | null = null;

  async query(q: TrackerQuery, ctx: TrackerContext): Promise<TrackerResult> {
    if (q.engine !== this.engine) {
      throw new Error(`DeepseekWebAdapter received query for engine=${q.engine}`);
    }

    const started = Date.now();
    let context: BrowserContext | undefined;

    try {
      const userDataDir = getDeepseekUserDataDir();
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

      // Composer
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
            'composer textarea not found. Run `pnpm deepseek:probe` to refresh selectors.',
          meta: { elapsed_ms: Date.now() - started },
        };
      }

      // Enable web search BEFORE typing. If we type then toggle, DeepSeek may
      // submit on Enter mid-toggle. Idempotency: skip if already-active class.
      await this.#ensureWebSearchOn(page);

      await input.click();
      await input.fill(q.question);

      // Try send button first (arrow-up icon); fall back to Enter.
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

      // DeepSeek doesn't always flip URL after submit (chat list lives in
      // sidebar, route stays at /). Stability poll directly on message text.
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
              ? 'login required or selectors broken — no answer text rendered. Run `pnpm deepseek:login` then `pnpm deepseek:probe`.'
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

  async #ensureWebSearchOn(page: import('playwright').Page): Promise<void> {
    // Try every candidate; click the first one that's NOT already active.
    for (const sel of SEARCH_TOGGLE_CANDIDATES) {
      const btn = await page.$(sel).catch(() => null);
      if (!btn) continue;
      const alreadyOn = await btn
        .evaluate((el) => {
          const aria = el.getAttribute('aria-pressed');
          if (aria === 'true') return true;
          const cls = (el as HTMLElement).className || '';
          return /active|enabled|on\b|selected/i.test(typeof cls === 'string' ? cls : '');
        })
        .catch(() => false);
      if (!alreadyOn) await btn.click().catch(() => undefined);
      return;
    }
    // Toggle not found — non-fatal; we still get an answer, just without RAG.
    // worker layer can flag this in meta if needed.
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

export const deepseekWebAdapter: TrackerAdapter = new DeepseekWebAdapter();
