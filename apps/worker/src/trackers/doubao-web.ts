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

import { chromium, type Browser, type BrowserContext } from 'playwright';
import type { TrackerAdapter, TrackerContext, TrackerQuery, TrackerResult } from '@geo/geo-core';

const CHAT_URL = 'https://www.doubao.com/chat/';
const INPUT_SELECTOR = 'textarea[placeholder*="发消息"]';
const MESSAGE_LIST_SELECTOR = '[class*="message-list"]';

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
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;

    try {
      // Use the system Chrome channel + disable the automation-controlled flag
      // so doubao.com sees a plausible real browser. Bundled Playwright chromium
      // gets hard-blocked (ERR_CONNECTION_CLOSED in headless, silent-ignored
      // in headful). V2 can layer a stealth plugin on top if this drifts.
      browser = await chromium.launch({
        headless: ctx.headless,
        channel: 'chrome',
        args: ['--disable-blink-features=AutomationControlled'],
      });
      context = await browser.newContext({
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
      const page = await context.newPage();

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
      await page.keyboard.press('Enter');

      // The URL flips to /chat/<session-id> once the message is accepted.
      await page
        .waitForURL(/\/chat\/[^/]+$/, { timeout: Math.min(remaining(), 15_000) })
        .catch(() => undefined);

      // Poll the message-list until it's stable.
      let lastLen = -1;
      let idleCount = 0;
      while (remaining() > 0) {
        await page.waitForTimeout(POLL_INTERVAL_MS);

        const len = await page
          .evaluate((sel) => {
            const el = document.querySelector(sel);
            return el ? (el.textContent || '').length : 0;
          }, MESSAGE_LIST_SELECTOR)
          .catch(() => 0);

        if (len >= MIN_RESPONSE_CHARS && len === lastLen) {
          idleCount += 1;
          if (idleCount >= STABLE_REQUIRED_IDLES) break;
        } else {
          idleCount = 0;
        }
        lastLen = len;
      }

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
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }
  }

  async #extract(page: import('playwright').Page): Promise<{
    raw_response: string;
    citation_urls: string[];
  }> {
    return page.evaluate((sel) => {
      const list = document.querySelector(sel);
      if (!list) return { raw_response: '', citation_urls: [] };
      const raw_response = (list.textContent || '').trim();
      const urls = new Set<string>();
      for (const a of Array.from(list.querySelectorAll('a[href]'))) {
        const href = (a as HTMLAnchorElement).href;
        if (href.startsWith('http')) urls.add(href);
      }
      return { raw_response, citation_urls: [...urls] };
    }, MESSAGE_LIST_SELECTOR);
  }
}

export const doubaoWebAdapter: TrackerAdapter = new DoubaoWebAdapter();
