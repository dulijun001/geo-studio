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
import { launchPersistentContext } from 'cloakbrowser';
import type { BrowserContext } from 'playwright';
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
  // 2026-09-12 实测:元宝换了新框架(class 里带 --new-framework),发送键变成
  // CSS module 生成的 `SendButton_sendButton__<hash>`。哈希每次构建都会变,
  // 所以只匹配稳定前缀。旧的 icon-send 已经失效,但留着不删——降级不死翘。
  '[class*="SendButton_sendButton"]',
  '[class*="sendButton"]',
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
/**
 * 首页/欢迎页指纹(D76,2026-09-19)。
 *
 * 豆包踩过这个坑并在 D72 修过:改版后只剩 `main` 能取到文本,而欢迎页的 `main`
 * 本身就有上百字且静止不变 —— 轮询会把「欢迎页」判成「稳定的答案」。
 * 元宝和 DeepSeek 的 MESSAGE_CANDIDATES 末位同样是 `'main'`,同样没有指纹校验,
 * 但它们比豆包更坏:豆包起码有出口指纹兜底返回 failed,这两个会直接
 * `status:'done'` 把首页文案当答案落库,再去扫品牌词 —— **往库里灌假数据**。
 * 修法与 D72 一致:只要文本还像欢迎页,就不允许判稳定。
 */
const WELCOME_FINGERPRINTS = [
  '今天能帮你做什么',
  '下载元宝电脑版',
  'AI 创作',
  '深度研究',
  'PPT 生成',
  '内容由AI生成',
];
const WELCOME_HIT_THRESHOLD = 2;


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
      // V1.11.2 — CloakBrowser; webdriver / UA / fingerprint 由 binary 处理
      context = await launchPersistentContext({
        userDataDir,
        headless: ctx.headless,
        proxy: ctx.proxy,
        viewport: { width: 1280, height: 900 },
        args: ['--lang=zh-CN'],
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
          .evaluate(({ selectors, fps }) => {
            for (const s of selectors) {
              const els = Array.from(document.querySelectorAll(s));
              if (!els.length) continue;
              let chars = 0;
              let text = '';
              for (const el of els) {
                const t = el.textContent || '';
                chars += t.length;
                text += t;
              }
              if (chars > 0) {
                return { sel: s, len: chars, welcomeHits: fps.filter((kw) => text.includes(kw)).length };
              }
            }
            return { sel: null as string | null, len: 0, welcomeHits: 0 };
          }, { selectors: MESSAGE_CANDIDATES, fps: WELCOME_FINGERPRINTS })
          .catch(() => ({ sel: null as string | null, len: 0, welcomeHits: 0 }));
        if (probe.sel) this._lastWinner = probe.sel;
        const len = probe.len;
        // D76:还像欢迎页就不算数,否则会把静止的首页文案判成「稳定答案」并落库
        if (probe.welcomeHits >= WELCOME_HIT_THRESHOLD) {
          idleCount = 0;
          lastLen = len;
          continue;
        }
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
      const sources = await this.#extractSources(page).catch((e) => ({
        urls: [] as string[],
        meta: { sources_error: e instanceof Error ? e.message : String(e) } as Record<string, unknown>,
      }));

      return {
        status: 'done',
        raw_response: extracted.raw_response,
        citation_urls: [...new Set([...extracted.citation_urls, ...sources.urls])],
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

  /**
   * 引用源采集(2026-09-12,照搬豆包 D43-B 的思路)。
   *
   * 元宝的来源**不在初始 DOM**:答案区一个 http 外链都没有(实测展开前后都是 0),
   * 所以此前 citation_urls 恒为空,一度让我误判「元宝不做检索」。实际它做 ——
   * 页面里有 `data-toolbar-type="citation" aria-label="引用17篇资料作为参考"`,
   * 点开才渲染来源列表。
   *
   * ⚠️ 现状:**这个实现拿不到来源,已知不够,留着是为了记录已查清的事实**。
   * 实测点开 citation toolbar 后页面外链数仍是 0。翻 HTML 才明白为什么:
   * 元宝的引用是**索引不是链接** —— 正文里嵌的是
   * `<div class="hyc-common-markdown__ref-list__trigger" data-idx-list="2,14">`,
   * 只有序号和一个图标,URL 根本不在 DOM 里(`__NEXT_DATA__` 里也没有,
   * 全页非腾讯外链只有 googletagmanager 和一张图片)。
   *
   * 要真拿到得走这两条之一(都没做):
   *   (a) 悬停/点击每个 `[data-idx-list]` 芯片,等 tooltip 里渲染出 URL;
   *   (b) 用 `page.on('response')` 截网络响应,从携带来源列表的接口 JSON 里取。
   * (b) 更稳,不依赖 hover 交互,推荐走这条。
   *
   * 采不到不影响 done 状态 —— 引用源是加分项,答案本身才是主信号(ADR-002)。
   */
  async #extractSources(page: import('playwright').Page): Promise<{
    urls: string[];
    meta: Record<string, unknown>;
  }> {
    const CITATION_TOGGLE = '[data-toolbar-type="citation"]';
    const before = new Set(
      await page.locator('a[href^="http"]').evaluateAll((as) =>
        (as as HTMLAnchorElement[]).map((a) => a.href),
      ),
    );
    const toggle = page.locator(CITATION_TOGGLE).first();
    if ((await toggle.count()) === 0) {
      return { urls: [], meta: { sources_expander: null, sources_note: 'no citation toolbar' } };
    }
    await toggle.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(2_000);
    const after = await page.locator('a[href^="http"]').evaluateAll((as) =>
      (as as HTMLAnchorElement[]).map((a) => a.href),
    );
    // 只要新增的,并剔掉元宝自家域名(favicon/官网这类不是来源)
    const urls = [...new Set(after)].filter(
      (u) => !before.has(u) && !/yuanbao\.tencent\.com|static\.yuanbao|qq\.com\/favicon/.test(u),
    );
    return {
      urls,
      meta: { sources_expander: CITATION_TOGGLE, sources_found: urls.length },
    };
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
