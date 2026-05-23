/**
 * auto-click 第一个 image-wrapper-YJelRW clickable card,看弹层 DOM 里有没有原文 URL。
 * 同时监听 page 所有 XHR + new pages,确保 URL 不会漏。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { launchPersistentContext } from 'cloakbrowser';

const QUERY = process.argv[2] || '昆明松鼠口腔怎么样';
const SCREENSHOT_DIR = '/tmp/doubao-debug';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const userDataDir = process.env.GEO_DOUBAO_USERDATA || join(homedir(), '.cache', 'geo-tracker', 'doubao');
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const ctx = await launchPersistentContext({
    userDataDir,
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--lang=zh-CN'],
  });

  const xhrLog: Array<{ url: string; method: string }> = [];
  const pageLog: string[] = [];
  ctx.on('request', (req) => {
    if (/api|search|ref|source|citation/.test(req.url())) {
      xhrLog.push({ url: req.url(), method: req.method() });
    }
  });
  ctx.on('page', (newPage) => {
    pageLog.push(`NEW PAGE: ${newPage.url()}`);
  });

  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto('https://www.doubao.com/chat/', { waitUntil: 'domcontentloaded' });
  await page.keyboard.press('Escape').catch(() => undefined);
  await sleep(2000);

  const input = await page.waitForSelector('textarea[placeholder*="发消息"]', { timeout: 10_000 });
  await input.click({ timeout: 3000, force: true });
  await input.fill(QUERY);
  await sleep(1000);
  for (const sel of ['[class*="send-btn-wrapper"] button:not([disabled])']) {
    const btn = await page.$(sel).catch(() => null);
    if (btn) { await btn.click({ timeout: 3000, force: true }).catch(() => undefined); break; }
  }

  console.log('[card-click] waiting 18s for RAG answer + cards...');
  await sleep(18000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/cc01-before-click.png` }).catch(() => undefined);

  console.log('[card-click] clicking first image-wrapper-YJelRW.clickable-axeVcZ...');
  const card = await page.locator('.image-wrapper-YJelRW.clickable-axeVcZ').first();
  await card.click({ timeout: 5000 }).catch((e) => {
    console.log('[card-click] click err:', e.message?.slice(0, 100));
  });
  await sleep(3000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/cc02-after-click.png` }).catch(() => undefined);

  // dump 弹层 DOM
  console.log('\n========== POST-CLICK DOM ==========');
  const post = await page.evaluate(`(() => {
    const ret = {
      url: location.href,
      visible_a: Array.from(document.querySelectorAll('a[href^="http"]'))
        .filter(a => a.offsetParent !== null)
        .slice(0, 25)
        .map(a => ({ href: a.href, text: (a.textContent || '').slice(0, 80) })),
      high_z: Array.from(document.querySelectorAll('*'))
        .filter(el => {
          const z = parseInt(window.getComputedStyle(el).zIndex || '0');
          return z >= 100 && el.offsetParent !== null;
        })
        .slice(0, 8)
        .map(el => ({
          cls: (el.className || '').toString().slice(0, 80),
          tag: el.tagName,
          text_first_120: (el.textContent || '').slice(0, 120),
        })),
      drawer_panel_modal: Array.from(document.querySelectorAll('[class*="drawer"], [class*="modal"], [class*="popover"], [class*="dialog"], [role="dialog"]'))
        .filter(el => el.offsetParent !== null)
        .slice(0, 5)
        .map(el => ({
          cls: (el.className || '').toString().slice(0, 80),
          role: el.getAttribute('role'),
          text_first_200: (el.textContent || '').slice(0, 200),
          inner_a_count: el.querySelectorAll('a[href]').length,
          inner_a_sample: Array.from(el.querySelectorAll('a[href]')).slice(0, 5).map(a => a.href),
        })),
    };
    return ret;
  })()`).catch((e) => ({ error: String(e).slice(0, 200) }));
  console.log(JSON.stringify(post, null, 2));

  console.log('\n========== XHR LOG ==========');
  console.log(JSON.stringify(xhrLog.slice(0, 20), null, 2));
  console.log('\n========== NEW PAGES ==========');
  console.log(JSON.stringify(pageLog, null, 2));

  await writeFile(`${SCREENSHOT_DIR}/card-click-result.json`, JSON.stringify({ post, xhrLog, pageLog }, null, 2)).catch(() => undefined);

  console.log('\n[card-click] keep open 30s to observe');
  await sleep(30000);
  await ctx.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[card-click] fatal:', err);
  process.exit(1);
});
