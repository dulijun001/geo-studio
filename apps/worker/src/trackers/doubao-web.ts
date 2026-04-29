/// <reference lib="dom" />
/**
 * Doubao Web tracker adapter.
 *
 * Per D4: GEO tracking must observe the answer a real user would see, not the
 * API response. We drive a real Chromium page against https://www.doubao.com/chat/
 * in guest mode (W6.0 probe confirmed guest works).
 *
 * Per ADR-002: the primary signal is brand-vocab NER against raw_response.
 * Citation URLs are captured when present but are a bonus, not required.
 *
 * Lifecycle: each query() launches a fresh browser, runs the question, and
 * tears down. V1 prefers isolation over throughput; V2 will pool contexts once
 * tracking accounts + proxies land.
 */

import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext } from 'playwright';
import type { TrackerAdapter, TrackerContext, TrackerQuery, TrackerResult } from '@geo/geo-core';

const CHAT_URL = 'https://www.doubao.com/chat/';
const INPUT_SELECTOR = 'textarea[placeholder*="发消息"]';
// Doubao currently renders the conversation tree as nested <main> divs; CSS
// modules rename frequently. Probe candidates (in order) and pick the first
// that holds the answer text. Update via `pnpm doubao:probe` when this rots.
const MESSAGE_CANDIDATES = [
  '[data-testid="receive-message"]',
  '[class*="receive-message"]',
  '[class*="message-content-wrapper"]',
  '[class*="messageContent"]',
  '[class*="message-list"]',
  '[class*="conversation-list"]',
  'main',
];
// Hint that the conversation has actually started (URL flips, OR a "thinking"
// indicator appears, OR the welcome cards disappear).
const WELCOME_HINT_SELECTOR = '[class*="welcome"], [data-testid="welcome"], [class*="banner-card"]';

/**
 * Persistent Chrome user-data dir. Holds the doubao login cookie so the
 * tracker doesn't ask for a captcha every run. Override via env
 * GEO_DOUBAO_USERDATA for test isolation. Run `pnpm doubao:login` once
 * to populate this directory.
 */
function getUserDataDir(): string {
  return process.env.GEO_DOUBAO_USERDATA || join(homedir(), '.cache', 'geo-tracker', 'doubao');
}

/**
 * Wait until the answer stops growing. We poll the message-list text length;
 * three consecutive idle samples with >= 100 chars means the stream finished.
 * The hard cap is ctx.timeout_ms.
 */
const STABLE_REQUIRED_IDLES = 3;
const POLL_INTERVAL_MS = 1000;
const MIN_RESPONSE_CHARS = 100;

class DoubaoWebAdapter implements TrackerAdapter {
  readonly engine = 'doubao' as const;

  async query(q: TrackerQuery, ctx: TrackerContext): Promise<TrackerResult> {
    if (q.engine !== this.engine) {
      throw new Error(`DoubaoWebAdapter received query for engine=${q.engine}`);
    }

    const started = Date.now();
    let context: BrowserContext | undefined;

    try {
      // PERSISTENT user-data dir (was mkdtemp before). Doubao now requires a
      // logged-in account to actually answer questions — guests get the
      // welcome screen with recommendation cards but submit is silently
      // dropped. Run `pnpm doubao:login` once to seed the cookie; this
      // tracker reuses it on every subsequent call.
      const userDataDir = getUserDataDir();
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
      // Hide navigator.webdriver before any page script runs.
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });
      const page = context.pages()[0] ?? (await context.newPage());

      // AbortController wires ctx.timeout_ms into every await below.
      const hardDeadline = started + ctx.timeout_ms;
      const remaining = () => Math.max(0, hardDeadline - Date.now());

      await page.goto(CHAT_URL, {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(remaining(), 30_000),
      });

      // Dismiss any welcome/activity modal by pressing Escape — the page still
      // accepts input while it's open but the overlay can steal clicks.
      await page.keyboard.press('Escape').catch(() => undefined);

      // Wait for the composer. If we never see it, treat as failure (likely
      // hard captcha or layout change).
      const input = await page
        .waitForSelector(INPUT_SELECTOR, { timeout: Math.min(remaining(), 10_000) })
        .catch(() => null);
      if (!input) {
        return {
          status: 'failed',
          failure_reason: 'composer textarea not found (layout change or hard captcha)',
          meta: { elapsed_ms: Date.now() - started },
        };
      }

      await input.click();
      await input.fill(q.question);

      // Try to submit. Enter alone is unreliable since 2026-04 (intercepted
      // by IME / promo overlay). Click the send button as primary path; fall
      // back to Enter, then Cmd+Enter, in that order.
      const sendBtnSelectors = [
        '[class*="send-btn-wrapper"] button:not([disabled])',
        'button[class*="send-msg-btn"]:not([disabled])',
        '[class*="send-btn-wrapper"]:not([disabled])',
      ];
      let submitted = false;
      for (const sel of sendBtnSelectors) {
        const btn = await page.$(sel).catch(() => null);
        if (btn && (await btn.isEnabled().catch(() => false))) {
          await btn.click().catch(() => undefined);
          submitted = true;
          break;
        }
      }
      if (!submitted) {
        await page.keyboard.press('Enter').catch(() => undefined);
        await page.waitForTimeout(300);
        await page.keyboard.press('Meta+Enter').catch(() => undefined);
      }

      // The URL flips to /chat/<session-id> once the message is accepted.
      // If it never flips after 15s, we're not logged in (Doubao silently
      // drops guest submits). Bail with a clear "needs login" reason.
      const flipped = await page
        .waitForURL(/\/chat\/[^/]+$/, { timeout: Math.min(remaining(), 15_000) })
        .then(() => true)
        .catch(() => false);
      if (!flipped) {
        return {
          status: 'failed',
          failure_reason:
            'login required — chat URL never advanced past welcome page. Run `pnpm doubao:login` to seed the cookie.',
          meta: { elapsed_ms: Date.now() - started },
        };
      }

      // Poll candidate selectors until one of them stabilizes. Picking via
      // probe each tick is cheap and tolerant of CSS module renames.
      let lastLen = -1;
      let idleCount = 0;
      let lastWinner: string | null = null;
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
        const len = probe.len;
        if (probe.sel) lastWinner = probe.sel;

        if (len >= MIN_RESPONSE_CHARS && len === lastLen) {
          idleCount += 1;
          if (idleCount >= STABLE_REQUIRED_IDLES) break;
        } else {
          idleCount = 0;
        }
        lastLen = len;
      }
      // Stash the winning selector for #extract to reuse.
      (this as { _lastWinner?: string | null })._lastWinner = lastWinner;

      if (idleCount < STABLE_REQUIRED_IDLES) {
        // Timed out — still extract whatever text we have; upstream can decide
        // whether a partial answer is useful.
        const partial = await this.#extract(page);
        return {
          status: 'failed',
          failure_reason: 'response did not stabilize before timeout',
          raw_response: partial.raw_response,
          citation_urls: partial.citation_urls,
          meta: {
            elapsed_ms: Date.now() - started,
            final_text_len: lastLen,
          },
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
      // Persistent userDataDir is intentionally NOT removed — we want the
      // login cookie to survive between tracker runs.
      await context?.close().catch(() => undefined);
    }
  }

  async #extract(page: import('playwright').Page): Promise<{
    raw_response: string;
    citation_urls: string[];
  }> {
    const lastWinner = (this as { _lastWinner?: string | null })._lastWinner ?? null;
    const selectors = lastWinner ? [lastWinner, ...MESSAGE_CANDIDATES] : MESSAGE_CANDIDATES;
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

// WELCOME_HINT_SELECTOR exported for the login helper to detect "are we still
// on the welcome screen, i.e. not logged in yet"
export { WELCOME_HINT_SELECTOR, getUserDataDir };

export const doubaoWebAdapter: TrackerAdapter = new DoubaoWebAdapter();
