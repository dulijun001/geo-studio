/**
 * 专门 dump 豆包 RAG 答案上方那 4 个图片引用卡片真实 DOM。
 * 找 img 元素 / data-* attributes / 卡片可点击 handler 拿到真实引用源 URL。
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

  const input = await page.waitForSelector('textarea[placeholder*="发消息"]', { timeout: 10_000 });
  await input.click({ timeout: 3000, force: true });
  await input.fill(QUERY);
  await sleep(1000);
  for (const sel of ['[class*="send-btn-wrapper"] button:not([disabled])']) {
    const btn = await page.$(sel).catch(() => null);
    if (btn) { await btn.click({ timeout: 3000, force: true }).catch(() => undefined); break; }
  }

  console.log('[image-cards] waiting 20s for RAG answer + cards to render...');
  await sleep(20000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/ic01-rendered.png` }).catch(() => undefined);

  // 1. 抓页面所有 <img> 及其 ancestor chain (找引用图片卡片所在容器)
  console.log('\n========== ALL <img> + ANCESTOR CHAIN ==========');
  const imgs = await page.evaluate(`(() => {
    return Array.from(document.querySelectorAll('img')).slice(0, 30).map(img => {
      const ancestors = [];
      let el = img.parentElement;
      for (let i = 0; i < 6 && el; i++) {
        ancestors.push({
          tag: el.tagName,
          cls: (el.className || '').toString().slice(0, 60),
          // 提取所有 data-* 属性
          data: Array.from(el.attributes || []).filter(a => a.name.startsWith('data-')).reduce((acc, a) => { acc[a.name] = a.value.slice(0, 100); return acc; }, {}),
          href: el.tagName === 'A' ? el.href : null,
        });
        el = el.parentElement;
      }
      return {
        src: img.src.slice(0, 200),
        alt: img.alt,
        width: img.width,
        height: img.height,
        ancestors,
      };
    });
  })()`).catch((e) => ({ error: String(e).slice(0, 200) }));
  console.log(JSON.stringify(imgs, null, 2).slice(0, 8000));

  // 2. 找包含 4 个相邻图片的容器(可能就是引用卡片容器)
  console.log('\n========== HORIZONTAL IMAGE STRIP (likely citation cards) ==========');
  const strip = await page.evaluate(`(() => {
    // 找所有 ancestor 包含 >= 3 个直接 img 后代的 div
    const divs = Array.from(document.querySelectorAll('div'));
    const candidates = [];
    for (const div of divs) {
      const imgs = div.querySelectorAll(':scope > * img, :scope > img');
      if (imgs.length >= 3 && imgs.length <= 8) {
        candidates.push({
          cls: (div.className || '').toString().slice(0, 100),
          img_count: imgs.length,
          children_tags: Array.from(div.children).slice(0, 8).map(c => ({
            tag: c.tagName,
            cls: (c.className || '').toString().slice(0, 60),
            data: Array.from(c.attributes || []).filter(a => a.name.startsWith('data-')).map(a => a.name + '=' + a.value.slice(0, 50)),
            // 子节点里的 href 和 text
            hrefs: Array.from(c.querySelectorAll('a[href]')).map(a => a.href).slice(0, 3),
            text_first_80: (c.textContent || '').slice(0, 80),
          })),
        });
      }
    }
    return candidates.slice(0, 5);
  })()`).catch((e) => ({ error: String(e).slice(0, 200) }));
  console.log(JSON.stringify(strip, null, 2));
  await writeFile(`${SCREENSHOT_DIR}/image-cards-probe.json`, JSON.stringify({ imgs, strip }, null, 2)).catch(() => undefined);

  console.log('\n[image-cards] keep open 20s — observe in noVNC, try clicking a card');
  await sleep(20000);
  await ctx.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[image-cards] fatal:', err);
  process.exit(1);
});
