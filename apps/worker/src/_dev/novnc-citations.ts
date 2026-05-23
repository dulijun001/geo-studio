/**
 * 专门探"参考 N 篇资料"的真实 DOM 位置。
 * 1. 跑 query
 * 2. 用 page.locator 找含"参考"+数字的元素
 * 3. 尝试 click,看能不能展开引用面板
 * 4. dump 展开后所有 DOM
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
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto('https://www.doubao.com/chat/', { waitUntil: 'domcontentloaded' });
  await page.keyboard.press('Escape').catch(() => undefined);
  await sleep(2000);

  // submit
  const input = await page.waitForSelector('textarea[placeholder*="发消息"]', { timeout: 10_000 });
  await input.click({ timeout: 3000, force: true });
  await input.fill(QUERY);
  await sleep(1000);
  const sendSelectors = [
    '[class*="send-btn-wrapper"] button:not([disabled])',
    'button[class*="send-msg-btn"]:not([disabled])',
    '[class*="send-btn-wrapper"]:not([disabled])',
  ];
  for (const sel of sendSelectors) {
    const btn = await page.$(sel).catch(() => null);
    if (btn) { await btn.click({ timeout: 3000, force: true }).catch(() => undefined); break; }
  }

  console.log('[citations-probe] waiting 20s for answer...');
  await sleep(20000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/c01-answer-rendered.png` }).catch(() => undefined);

  // 1. 找"参考 N 篇" 文本所在 element + 它周围 element + parent siblings
  console.log('\n========== SEARCHING "参考 N 篇" ==========');
  const r1 = await page.evaluate(`(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const matches = all.filter(el => {
      const t = (el.textContent || '').trim();
      if (!/参考\\s*\\d+\\s*篇/.test(t)) return false;
      // 选最小的容器,不要 body/html
      return el.children.length < 5;
    });
    return matches.slice(0, 5).map(el => ({
      tag: el.tagName,
      cls: (el.className || '').toString(),
      text: (el.textContent || '').slice(0, 100),
      role: el.getAttribute('role'),
      onclick: !!el.onclick,
      cursor: window.getComputedStyle(el).cursor,
      html: el.outerHTML.slice(0, 400),
      parent_cls: (el.parentElement && el.parentElement.className || '').toString().slice(0, 100),
    }));
  })()`).catch((e) => ({ error: String(e).slice(0, 200) }));
  console.log(JSON.stringify(r1, null, 2));

  // 2. 尝试 click 第一个 "参考N篇" 元素 / 周围,看会不会弹出引用面板
  console.log('\n[citations-probe] attempting to click "参考N篇" element...');
  const clicked = await page.evaluate(`(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const target = all.find(el => {
      const t = (el.textContent || '').trim();
      return /参考\\s*\\d+\\s*篇/.test(t) && el.children.length < 5;
    });
    if (!target) return { found: false };
    target.scrollIntoView();
    (target).click();
    return {
      found: true,
      tag: target.tagName,
      cls: (target.className || '').toString().slice(0, 80),
    };
  })()`).catch((e) => ({ error: String(e).slice(0, 200) }));
  console.log('clicked:', JSON.stringify(clicked));

  await sleep(3000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/c02-after-ref-click.png` }).catch(() => undefined);

  // 3. 再扫一遍 DOM,看有没有新的 panel / modal / drawer 出现
  console.log('\n========== POST-CLICK SCAN ==========');
  const r2 = await page.evaluate(`(() => {
    const links = Array.from(document.querySelectorAll('a[href^="http"]')).map(a => ({
      href: a.href,
      text: (a.textContent || '').slice(0, 80),
      visible: a.offsetParent !== null,
    }));
    // 通用容器关键词扩展
    const containerKws = ['drawer', 'modal', 'popover', 'sidebar', 'panel', 'tooltip', 'card-list', 'ref-list', 'source-list', 'search-list', 'rag-', 'result-list', 'sec-card', 'preview-card'];
    const matches = {};
    for (const kw of containerKws) {
      const els = Array.from(document.querySelectorAll('[class*="' + kw + '"]'));
      matches[kw] = els.length;
    }
    // 找新出现的弹层(z-index >= 100)
    const highZ = Array.from(document.querySelectorAll('*')).filter(el => {
      const z = parseInt(window.getComputedStyle(el).zIndex || '0');
      return z >= 100 && el.offsetParent !== null;
    }).slice(0, 8).map(el => ({
      cls: (el.className || '').toString().slice(0, 80),
      tag: el.tagName,
      text: (el.textContent || '').slice(0, 80),
      z: window.getComputedStyle(el).zIndex,
    }));
    return {
      total_links: links.length,
      visible_links: links.filter(l => l.visible),
      container_matches: matches,
      high_z_panels: highZ,
    };
  })()`).catch((e) => ({ error: String(e).slice(0, 200) }));
  console.log(JSON.stringify(r2, null, 2));
  await writeFile(`${SCREENSHOT_DIR}/citations-probe-result.json`, JSON.stringify({ r1, clicked, r2 }, null, 2)).catch(() => undefined);

  console.log('\n[citations-probe] keep open 30s for you to observe in noVNC...');
  await sleep(30000);
  await ctx.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[citations-probe] fatal:', err);
  process.exit(1);
});
