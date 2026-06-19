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
import { launchPersistentContext } from 'cloakbrowser';
import type { BrowserContext } from 'playwright';
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
 * Optional CloakBrowser fingerprint seed. When set (e.g. GEO_DOUBAO_FINGERPRINT=88888),
 * CloakBrowser produces a deterministic device identity from the seed — every launch
 * looks like the *same* Windows desktop. Changing the seed = pretending to be a brand-new
 * device, used to escape a device-fingerprint blocklist (see 2026-06-08 Doubao 风控 / D43).
 * MUST pair with a fresh GEO_DOUBAO_USERDATA profile — reusing the blocklisted profile
 * with a new seed defeats the purpose. Unset → CloakBrowser auto-generates a random seed.
 */
function fingerprintArgs(): string[] {
  const seed = process.env.GEO_DOUBAO_FINGERPRINT?.trim();
  return seed ? [`--fingerprint=${seed}`] : [];
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
      // 2026-05-21 V1.11.2: CloakBrowser 替换 Playwright vanilla — C++ 源码级
      // 49 处反爬补丁 (canvas/WebGL/audio/fonts/GPU/WebRTC/UA/CDP/TLS)。
      // 跨平台 fingerprint 默认伪装 Windows,Mac 扫码的 cookie 拿到 ECS
      // 复用时设备指纹一致,Doubao 不会判 "异常设备" 让 cookie 失效。
      // navigator.webdriver / window.chrome / plugins 由 binary 处理,不再
      // 手动 init script 注入。
      context = await launchPersistentContext({
        userDataDir,
        headless: ctx.headless,
        proxy: ctx.proxy,
        viewport: { width: 1280, height: 900 },
        // locale/timezone 走 binary --lang/--fingerprint-timezone,不传 context option
        // (CloakBrowser 文档:走 CDP emulation 会被 detect)
        args: ['--lang=zh-CN', ...fingerprintArgs()],
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

      // V1.11.4c: 不让 input.click 用默认 30s actionTimeout。RAG 模式下输入框
      // 可能被遮挡或 transient,等 stable 等不来。force:true + 3s 上限。失败
      // fallback fill 直接打字。
      await input
        .click({ timeout: 3000, force: true })
        .catch(() => undefined);
      await input.fill(q.question, { timeout: 5000 }).catch(async () => {
        // fill failed → type 字符级 fallback
        await input.type(q.question, { delay: 20 }).catch(() => undefined);
      });

      // Try to submit. Strategy:
      //   1. send-button click with short per-attempt timeout — V2 fix.
      //      原 V1 单 click 没 timeout option,默认 actionTimeout=30s。
      //      RAG/local 题模式下豆包 DOM 在 transient state,Playwright 等
      //      element scroll-into-view 等不到稳定就 30s 超时(已观察)。
      //      新版每个 selector 限 3s,force=true 跳过 stability 检查 — 豆豆
      //      新 UI 切换快,等 stable 反而比直接 click 慢且容易 stale。
      //   2. 全失败 → keyboard Enter + Meta+Enter 兜底
      // 单条总 wall-clock 上限 = 3 selectors × 3s + 300ms = ~9.3s,远低于
      // 旧 30s 行为,留余地给后续 waitForURL.
      const sendBtnSelectors = [
        '[class*="send-btn-wrapper"] button:not([disabled])',
        'button[class*="send-msg-btn"]:not([disabled])',
        '[class*="send-btn-wrapper"]:not([disabled])',
        // V2 新增:RAG/搜索模式下豆包改用 svg-icon 按钮
        '[class*="search-submit"]:not([disabled])',
        'button[aria-label*="发送"]:not([disabled])',
      ];
      let submitted = false;
      let submittedVia: string | null = null;
      for (const sel of sendBtnSelectors) {
        const btn = await page.$(sel).catch(() => null);
        if (!btn) continue;
        const enabled = await btn.isEnabled().catch(() => false);
        if (!enabled) continue;
        const ok = await btn
          .click({ timeout: 3000, force: true })
          .then(() => true)
          .catch(() => false);
        if (ok) {
          submitted = true;
          submittedVia = sel;
          break;
        }
      }
      if (!submitted) {
        await page.keyboard.press('Enter').catch(() => undefined);
        await page.waitForTimeout(300);
        await page.keyboard.press('Meta+Enter').catch(() => undefined);
        submittedVia = 'keyboard';
      }

      // The URL flips to /chat/<session-id> once the message is accepted.
      // V2 改 — RAG/搜索模式可能 URL 不变(留在 /chat/)但页面渲染
      // <search-results>。所以判断"已经提交"用两个信号 OR:
      //   (a) URL match /chat/<id>   — 普通 chat 模式
      //   (b) 5s 内 welcome 卡片消失了 — RAG 模式 / 已经在 chat 里继续问
      const advancedByUrl = await page
        .waitForURL(/\/chat\/[^/]+$/, { timeout: Math.min(remaining(), 8_000) })
        .then(() => true)
        .catch(() => false);
      let advancedByDom = false;
      if (!advancedByUrl) {
        advancedByDom = await page
          .waitForSelector(WELCOME_HINT_SELECTOR, { state: 'hidden', timeout: 5_000 })
          .then(() => true)
          .catch(() => false);
      }
      const flipped = advancedByUrl || advancedByDom;
      if (!flipped) {
        return {
          status: 'failed',
          failure_reason:
            'submit not accepted — neither URL flip nor welcome hide observed. Likely login expired (cookie failed) or new captcha. Run `pnpm doubao:login` to re-seed.',
          meta: {
            elapsed_ms: Date.now() - started,
            submitted_via: submittedVia,
            current_url: page.url(),
          },
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

      // V1.11.4 数据卫生:RAG/local 题 click 失败时 advancedByDom 可能误通过,
      // 抓到的"回答"实际是豆包欢迎页 placeholder 内容(资讯卡片 / 文件上传
      // 提示 / 推荐 prompt 列表)。匹配 5+ welcome 指纹关键词时回 failed 不污染
      // 数据,SOV 战况图能区分"真 fail"vs"假 done"。
      const WELCOME_FINGERPRINTS = [
        '新对话内容由豆包 AI 生成',
        '在此处拖放文件',
        '快速PPT 生成',
        '图像生成',
        '请仔细甄别',
        '帮我写作翻译编程',
        '最多 50 个',
      ];
      const welcomeHits = WELCOME_FINGERPRINTS.filter((kw) =>
        extracted.raw_response.includes(kw),
      ).length;
      if (welcomeHits >= 3) {
        return {
          status: 'failed',
          failure_reason: `submit not effective — extracted content matches welcome page (${welcomeHits} fingerprints). Likely RAG/search-mode submit failed silently. V2 needs noVNC DOM debugging.`,
          meta: {
            elapsed_ms: Date.now() - started,
            session_url: page.url(),
            text_len: extracted.raw_response.length,
            submitted_via: submittedVia,
            flipped_by: advancedByUrl ? 'url' : 'dom',
            welcome_hits: welcomeHits,
            preview: extracted.raw_response.slice(0, 120),
          },
        };
      }

      // V1.12.1 (D43-B): 引用源采集。豆包来源是「参考 N 篇资料」点击展开的
      // 面板,链接不在初始 DOM(citation_urls 历史 123 个 done 快照全空)。
      // 点击展开后用 href 差集隔离来源链接;采不到不影响 done 状态。
      const sources = await this.#extractSources(page).catch((e) => ({
        urls: [] as string[],
        meta: { sources_error: e instanceof Error ? e.message : String(e) } as Record<string, unknown>,
      }));
      const citationUrls = [...new Set([...extracted.citation_urls, ...sources.urls])];

      return {
        status: 'done',
        raw_response: extracted.raw_response,
        citation_urls: citationUrls,
        meta: {
          elapsed_ms: Date.now() - started,
          session_url: page.url(),
          text_len: extracted.raw_response.length,
          submitted_via: submittedVia,
          flipped_by: advancedByUrl ? 'url' : 'dom',
          winning_selector: lastWinner,
          ...sources.meta,
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

  /**
   * V1.12.1 (D43-B): 展开「参考 N 篇资料 / 信息来源」面板并采集来源链接。
   *
   * 策略(D27/D29 纪律 — 短超时 fall-through + meta 全记录):
   *   1. 记录点击前页面上全部 http href(基线集合)
   *   2. 依次试 expander 候选(文本 pattern 优先,class 兜底),每个 2s 上限
   *   3. 点开后等 1.5s 渲染,再收集全部 href — 与基线的差集 = 来源面板链接
   *      (差集法不依赖面板 selector,猜错只是采不到,不会误采正文链接)
   *   4. 误触发导航离开 chat 页时 goBack 兜底
   *   5. meta 记录:用了哪个 expander / 差集数量 / 点击前后 href 数,
   *      Sentry 上能直接看到哪步断了(禁止黑盒)
   */
  async #extractSources(page: import('playwright').Page): Promise<{
    urls: string[];
    meta: Record<string, unknown>;
  }> {
    const collectHrefs = () =>
      page
        .evaluate(() =>
          Array.from(document.querySelectorAll('a[href]'))
            .map((a) => (a as HTMLAnchorElement).href)
            .filter((h) => h.startsWith('http')),
        )
        .catch(() => [] as string[]);

    const before = new Set(await collectHrefs());
    const urlBeforeClick = page.url();

    // expander 候选:文本 pattern 最稳(CSS modules 频繁改名,文案不改)
    const textPatterns = [/参考\s*\d+\s*篇资料/, /信息来源/, /资料来源/];
    const classCandidates = [
      '[class*="search-reference"]',
      '[class*="reference-entry"]',
      '[class*="search-result-entry"]',
      '[class*="source-entry"]',
    ];
    let expanderUsed: string | null = null;
    for (const pat of textPatterns) {
      const loc = page.getByText(pat).first();
      const ok = await loc
        .click({ timeout: 2000, force: true })
        .then(() => true)
        .catch(() => false);
      if (ok) {
        expanderUsed = `text:${pat.source}`;
        break;
      }
    }
    if (!expanderUsed) {
      for (const sel of classCandidates) {
        const el = await page.$(sel).catch(() => null);
        if (!el) continue;
        const ok = await el
          .click({ timeout: 2000, force: true })
          .then(() => true)
          .catch(() => false);
        if (ok) {
          expanderUsed = sel;
          break;
        }
      }
    }
    if (!expanderUsed) {
      return {
        urls: [],
        meta: { sources_expander: null, sources_found: 0, sources_note: 'no expander matched' },
      };
    }

    await page.waitForTimeout(1500);

    // 误触发整页导航(力点到正文链接) → 回退,放弃本次采集
    if (page.url() !== urlBeforeClick && !page.url().includes('doubao.com')) {
      await page.goBack().catch(() => undefined);
      return {
        urls: [],
        meta: { sources_expander: expanderUsed, sources_found: 0, sources_note: 'click navigated away' },
      };
    }

    const after = await collectHrefs();
    const fresh = [...new Set(after.filter((h) => !before.has(h)))];
    return {
      urls: fresh,
      meta: {
        sources_expander: expanderUsed,
        sources_found: fresh.length,
        sources_hrefs_before: before.size,
        sources_hrefs_after: after.length,
      },
    };
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
