/**
 * noVNC 调试会话(非交互版):跑一道 question,定时 dump DOM,你通过 noVNC
 * 观察整个过程。每个阶段 sleep 显式,方便看。
 *
 * 跑法(ECS 上):
 *   DISPLAY=:99 pnpm --filter @geo/worker exec tsx --env-file=../../.env \
 *     src/_dev/novnc-debug.ts "松鼠口腔怎么样"
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { launchPersistentContext } from 'cloakbrowser';

const QUERY = process.argv[2] || '松鼠口腔怎么样';
const SCREENSHOT_DIR = '/tmp/doubao-debug';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function shot(page: import('playwright').Page, label: string) {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const path = `${SCREENSHOT_DIR}/${Date.now()}-${label}.png`;
  await page.screenshot({ path }).catch(() => undefined);
  console.log(`[shot] ${label} → ${path}`);
}

async function dumpDom(page: import('playwright').Page, label: string) {
  // 用 evaluate(string) 直接传 JS 字符串绕开 tsx wrapper 的 __name 注入
  const code = `(() => {
    const sample = (sel) => Array.from(document.querySelectorAll(sel)).slice(0, 3).map(el => ({
      tag: el.tagName,
      cls: (el.className || '').toString().slice(0, 80),
      text80: (el.textContent || '').slice(0, 80),
    }));
    const ragCands = {};
    for (const sel of ['search-result', 'search-card', 'rag-', 'reference-', 'citation-', 'source-card', 'web-result']) {
      ragCands[sel] = document.querySelectorAll('[class*="' + sel + '"]').length;
    }
    return {
      url: location.href,
      title: document.title,
      body_first_500: document.body.innerText.slice(0, 500),
      welcome_visible: !!document.querySelector('[class*="welcome"], [data-testid="welcome"], [class*="banner-card"]'),
      input_visible: !!document.querySelector('textarea[placeholder*="发消息"]'),
      rag_candidates: ragCands,
      receive_message_count: document.querySelectorAll('[data-testid="receive-message"], [class*="receive-message"]').length,
      buttons_in_composer: Array.from(document.querySelectorAll('button')).slice(-15).map(b => ({
        cls: (b.className || '').toString().slice(0, 60),
        aria: b.getAttribute('aria-label'),
        text: (b.textContent || '').slice(0, 20),
        disabled: b.disabled,
      })),
      possible_answer_containers: sample('[class*="message"], [class*="answer"], [class*="result"], [class*="search"]'),
    };
  })()`;
  const d = await (page.evaluate as (s: string) => Promise<unknown>)(code).catch((e: unknown) => ({ error: String(e).slice(0, 200) }));
  console.log(`\n========== DOM @ ${label} ==========`);
  console.log(JSON.stringify(d, null, 2));
  console.log(`========== END DOM @ ${label} ==========\n`);
  await writeFile(`${SCREENSHOT_DIR}/${Date.now()}-${label}.json`, JSON.stringify(d, null, 2)).catch(() => undefined);
}

async function main() {
  const userDataDir = process.env.GEO_DOUBAO_USERDATA || join(homedir(), '.cache', 'geo-tracker', 'doubao');
  await mkdir(userDataDir, { recursive: true });
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  console.log(`[novnc-debug] query="${QUERY}" display=${process.env.DISPLAY ?? '!unset'}`);
  console.log('[novnc-debug] launching CloakBrowser...');

  const ctx = await launchPersistentContext({
    userDataDir,
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--lang=zh-CN'],
  });

  const page = ctx.pages()[0] ?? (await ctx.newPage());

  console.log('[novnc-debug] navigating to doubao chat...');
  await page.goto('https://www.doubao.com/chat/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.keyboard.press('Escape').catch(() => undefined);
  await sleep(3000);
  await shot(page, '01-loaded');
  await dumpDom(page, '01-loaded');

  console.log('[novnc-debug] filling input...');
  const input = await page.waitForSelector('textarea[placeholder*="发消息"]', { timeout: 10_000 });
  await input.click({ timeout: 3000, force: true }).catch(() => undefined);
  await input.fill(QUERY, { timeout: 5000 }).catch(() => undefined);
  await sleep(2000);
  await shot(page, '02-filled');

  console.log('[novnc-debug] trying send selectors one by one (3s timeout each)...');
  const sendBtnSelectors = [
    '[class*="send-btn-wrapper"] button:not([disabled])',
    'button[class*="send-msg-btn"]:not([disabled])',
    '[class*="send-btn-wrapper"]:not([disabled])',
    '[class*="search-submit"]:not([disabled])',
    'button[aria-label*="发送"]:not([disabled])',
  ];
  let submittedVia: string | null = null;
  for (const sel of sendBtnSelectors) {
    const btn = await page.$(sel).catch(() => null);
    if (!btn) {
      console.log(`[try] ${sel} → not found`);
      continue;
    }
    const enabled = await btn.isEnabled().catch(() => false);
    console.log(`[try] ${sel} → found, enabled=${enabled}`);
    if (!enabled) continue;
    const ok = await btn.click({ timeout: 3000, force: true }).then(() => true).catch((e: Error) => {
      console.log(`[try] ${sel} → click err: ${e.message.slice(0, 60)}`);
      return false;
    });
    if (ok) { submittedVia = sel; break; }
  }
  if (!submittedVia) {
    console.log('[try] all selectors failed, fallback keyboard Enter');
    await page.keyboard.press('Enter').catch(() => undefined);
    submittedVia = 'keyboard';
  }
  console.log(`[novnc-debug] submitted_via = ${submittedVia}`);

  await sleep(3000);
  await shot(page, '03-just-after-submit');
  await dumpDom(page, '03-just-after-submit');

  console.log('[novnc-debug] waiting 15s for answer to render...');
  await sleep(15000);
  await shot(page, '04-after-15s');
  await dumpDom(page, '04-after-15s');

  console.log('[novnc-debug] keeping browser open 60 more seconds for you to observe...');
  await sleep(60000);
  await shot(page, '05-final');
  await dumpDom(page, '05-final');

  // V1.11.4f 新增:专门 dump RAG 模式 citation panel 真实 DOM
  // 用户反馈"豆包说参考 12 篇资料但 citation_urls 是空"
  console.log('\n========== CITATION DOM PROBE ==========');
  const citationProbe = await page.evaluate(`(() => {
    // 1. 所有 <a href> 哪怕在 message 容器外
    const allLinks = Array.from(document.querySelectorAll('a[href^="http"]')).map(a => ({
      href: a.href,
      text: (a.textContent || '').slice(0, 60),
      // 上溯 5 层 ancestor 看 class 名,定位它在哪个容器
      ancestor_classes: (function(el) {
        const arr = [];
        for (let i = 0; i < 5 && el; i++) {
          arr.push((el.className || '').toString().slice(0, 50));
          el = el.parentElement;
        }
        return arr;
      })(a),
    }));

    // 2. 任何 element 含"参考"、"资料"、"来源"、"引用" 文本
    const refKeywordEls = Array.from(document.querySelectorAll('*')).filter(el => {
      const t = el.textContent || '';
      return /参考\\s*\\d+\\s*篇|参考资料|来源|引用|资料来源/.test(t) && el.children.length < 30;
    }).slice(0, 10).map(el => ({
      tag: el.tagName,
      cls: (el.className || '').toString().slice(0, 80),
      text: (el.textContent || '').slice(0, 100),
      children_count: el.children.length,
    }));

    // 3. class 含 reference / citation / source / search / ref
    const refClassMatches = {};
    for (const kw of ['reference', 'citation', 'source', 'search-card', 'search-source', 'ref-card', 'ref-item', 'evidence']) {
      const els = Array.from(document.querySelectorAll('[class*="' + kw + '"]'));
      refClassMatches[kw] = {
        count: els.length,
        sample: els.slice(0, 2).map(el => ({
          cls: (el.className || '').toString().slice(0, 80),
          tag: el.tagName,
          html_first_150: el.outerHTML.slice(0, 150),
        })),
      };
    }

    return {
      total_http_links: allLinks.length,
      links_first_15: allLinks.slice(0, 15),
      ref_keyword_elements: refKeywordEls,
      ref_class_matches: refClassMatches,
    };
  })()`).catch((e) => ({ error: String(e).slice(0, 200) }));
  console.log(JSON.stringify(citationProbe, null, 2));
  await writeFile(`${SCREENSHOT_DIR}/${Date.now()}-citation-probe.json`, JSON.stringify(citationProbe, null, 2)).catch(() => undefined);
  console.log('========== END CITATION DOM PROBE ==========\n');

  console.log('[novnc-debug] closing context.');
  await ctx.close().catch(() => undefined);
  process.exit(0);
}

main().catch((err) => {
  console.error('[novnc-debug] fatal:', err);
  process.exit(1);
});
