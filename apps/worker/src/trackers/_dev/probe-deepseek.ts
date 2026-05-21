/**
 * Probe DeepSeek DOM — 拍真实 selector 出来给 deepseek-web.ts 用。
 *
 * Usage:
 *   1. 先跑 _dev/deepseek-login.ts 登录(共享同一个 userDataDir)
 *   2. pnpm --filter @geo/worker exec tsx src/trackers/_dev/probe-deepseek.ts
 *
 * 输出:/tmp/deepseek-probe/{page.html,page.png,selectors.json}
 *
 * 不像 probe-dom.ts 用临时 userDataDir(豆包游客模式),DeepSeek 必须登录,
 * 所以这里**复用** _dev/deepseek-login.ts 写的持久化 dir。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { launchPersistentContext } from 'cloakbrowser';
import { getDeepseekUserDataDir } from '../deepseek-web';

const QUESTION = '南京种植牙推荐哪家口腔医院?';
const OUT_DIR = '/tmp/deepseek-probe';

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const userDataDir = getDeepseekUserDataDir();
  await mkdir(userDataDir, { recursive: true });

  const ctx = await launchPersistentContext({
    userDataDir,
    headless: false, // 必须可见 — 万一 selector 错可以人工干预
    viewport: { width: 1280, height: 900 },
    args: ['--lang=zh-CN'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  console.log('[probe-deepseek] opening chat.deepseek.com');
  await page.goto('https://chat.deepseek.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.keyboard.press('Escape').catch(() => undefined);

  const composerSelectors = [
    'textarea[placeholder*="问"]',
    'textarea[placeholder*="发送"]',
    'textarea[placeholder*="DeepSeek"]',
    'textarea#chat-input',
    'textarea',
    '[contenteditable="true"][role="textbox"]',
  ];
  let composer = null;
  for (const sel of composerSelectors) {
    try {
      composer = await page.waitForSelector(sel, { timeout: 4000 });
      console.log(`[probe-deepseek] composer matched: ${sel}`);
      break;
    } catch {
      console.log(`[probe-deepseek] composer NOT matched: ${sel}`);
    }
  }
  if (!composer) {
    const html = await page.content();
    await writeFile(`${OUT_DIR}/no-composer.html`, html);
    await page.screenshot({ path: `${OUT_DIR}/no-composer.png`, fullPage: true });
    console.log('[probe-deepseek] FAIL: no composer. Maybe not logged in. Run _dev/deepseek-login.ts first.');
    await ctx.close();
    return;
  }

  // Try to flip "联网搜索" toggle and capture which selector worked
  console.log('[probe-deepseek] looking for 联网搜索 toggle');
  const toggleProbe = await page.evaluate(() => {
    const found: Array<{ tag: string; text: string; aria: string | null; cls: string }> = [];
    document.querySelectorAll('button, [role="button"]').forEach((b) => {
      const txt = (b.textContent || '').trim();
      if (/联网|搜索|web\s*search/i.test(txt)) {
        found.push({
          tag: b.tagName,
          text: txt.slice(0, 40),
          aria: b.getAttribute('aria-label'),
          cls: typeof (b as HTMLElement).className === 'string'
            ? (b as HTMLElement).className.slice(0, 80)
            : '',
        });
      }
    });
    return found;
  });
  console.log('[probe-deepseek] toggle candidates:', JSON.stringify(toggleProbe, null, 2));

  await composer.click();
  await composer.fill(QUESTION);
  console.log('[probe-deepseek] question typed');

  const sendBtnSelectors = [
    'button[aria-label*="发送"]',
    'button[aria-label*="Send"]',
    'div[role="button"][aria-label*="发送"]',
    'button:has(svg)',
  ];
  let sent = false;
  for (const sel of sendBtnSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        const enabled = await btn.isEnabled();
        if (enabled) {
          await btn.click();
          console.log(`[probe-deepseek] clicked send via: ${sel}`);
          sent = true;
          break;
        }
      }
    } catch {
      /* try next */
    }
  }
  if (!sent) {
    await page.keyboard.press('Enter').catch(() => undefined);
    console.log('[probe-deepseek] fell back to Enter');
  }

  console.log('[probe-deepseek] waiting 50s for streaming response...');
  await page.waitForTimeout(50_000);

  console.log('[probe-deepseek] dumping page state');
  const html = await page.content();
  await writeFile(`${OUT_DIR}/page.html`, html);
  await page.screenshot({ path: `${OUT_DIR}/page.png`, fullPage: true });

  const candidates = [
    '[class*="ds-markdown"]',
    '[class*="markdown-body"]',
    '[role="article"]',
    '[class*="message-content"]',
    '[class*="chat-message"]',
    '[class*="answer"]',
    '[class*="response"]',
    '[class*="bubble"]',
    '[class*="reply"]',
    '[data-testid*="message"]',
    'main',
  ];
  const results: Array<{ selector: string; count: number; chars: number; sample: string }> = [];
  for (const sel of candidates) {
    const r = await page.evaluate((s) => {
      const els = Array.from(document.querySelectorAll(s));
      let chars = 0;
      let sample = '';
      for (const el of els) {
        const t = (el.textContent || '').trim();
        chars += t.length;
        if (!sample && t.length > 30) sample = t.slice(0, 100);
      }
      return { count: els.length, chars, sample };
    }, sel);
    results.push({ selector: sel, ...r });
  }

  const classNames = await page.evaluate(() => {
    const interesting = /message|chat|answer|response|reply|bubble|markdown|ds-/i;
    const seen = new Map<string, number>();
    document.querySelectorAll('[class]').forEach((el) => {
      const className =
        typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : '';
      className.split(/\s+/).forEach((c) => {
        if (interesting.test(c)) seen.set(c, (seen.get(c) ?? 0) + 1);
      });
    });
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  });

  await writeFile(
    `${OUT_DIR}/selectors.json`,
    JSON.stringify({ candidates: results, classNames, toggleProbe }, null, 2),
  );

  console.log('\n─── selector candidates (chars > 0 = answer text found) ───');
  for (const r of results) {
    console.log(
      `  ${r.selector.padEnd(38)} count=${r.count.toString().padStart(3)} chars=${r.chars.toString().padStart(6)}  ${r.sample}`,
    );
  }
  console.log('\n─── top class names (interesting) ───');
  for (const [c, n] of classNames) {
    console.log(`  ${c.padEnd(50)} ×${n}`);
  }
  console.log(`\n[probe-deepseek] outputs:\n  ${OUT_DIR}/page.html\n  ${OUT_DIR}/page.png\n  ${OUT_DIR}/selectors.json`);

  await ctx.close().catch(() => undefined);
}

main().catch((err) => {
  console.error('[probe-deepseek] fatal:', err);
  process.exit(1);
});
