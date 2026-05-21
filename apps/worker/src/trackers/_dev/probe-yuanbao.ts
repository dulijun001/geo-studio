/**
 * Probe Yuanbao DOM — 真实 selector dump,基于 probe-deepseek.ts 模板。
 *
 * Usage:
 *   1. 先跑 _dev/yuanbao-login.ts 登录(共享 userDataDir)
 *   2. pnpm --filter @geo/worker exec tsx src/trackers/_dev/probe-yuanbao.ts
 *
 * 输出:/tmp/yuanbao-probe/{page.html,page.png,selectors.json}
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { launchPersistentContext } from 'cloakbrowser';
import { getYuanbaoUserDataDir } from '../yuanbao-web';

const QUESTION = '南京种植牙推荐哪家口腔医院?';
const OUT_DIR = '/tmp/yuanbao-probe';

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const userDataDir = getYuanbaoUserDataDir();
  await mkdir(userDataDir, { recursive: true });

  const ctx = await launchPersistentContext({
    userDataDir,
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--lang=zh-CN'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  console.log('[probe-yuanbao] opening yuanbao.tencent.com/chat');
  await page.goto('https://yuanbao.tencent.com/chat', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.keyboard.press('Escape').catch(() => undefined);

  // Sweep all conceivable input candidates
  const composerSelectors = [
    'textarea[placeholder*="问元宝"]',
    'textarea[placeholder*="发送给元宝"]',
    'textarea[placeholder*="发消息"]',
    'textarea[placeholder*="问"]',
    'textarea[placeholder*="发送"]',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"]',
    'textarea',
  ];
  let composer = null;
  let composerSel: string | null = null;
  for (const sel of composerSelectors) {
    try {
      composer = await page.waitForSelector(sel, { timeout: 4000 });
      composerSel = sel;
      console.log(`[probe-yuanbao] composer matched: ${sel}`);
      break;
    } catch {
      console.log(`[probe-yuanbao] composer NOT matched: ${sel}`);
    }
  }

  // Dump every input-like element's tag + placeholder + class
  const inputProbe = await page.evaluate(() => {
    const list: Array<{
      tag: string;
      placeholder: string | null;
      contenteditable: string | null;
      role: string | null;
      cls: string;
    }> = [];
    document
      .querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')
      .forEach((el) => {
        list.push({
          tag: el.tagName,
          placeholder: el.getAttribute('placeholder'),
          contenteditable: el.getAttribute('contenteditable'),
          role: el.getAttribute('role'),
          cls:
            typeof (el as HTMLElement).className === 'string'
              ? (el as HTMLElement).className.slice(0, 80)
              : '',
        });
      });
    return list;
  });
  console.log('[probe-yuanbao] all input-like elements:', JSON.stringify(inputProbe, null, 2));

  if (!composer) {
    const html = await page.content();
    await writeFile(`${OUT_DIR}/no-composer.html`, html);
    await page.screenshot({ path: `${OUT_DIR}/no-composer.png`, fullPage: true });
    console.log('[probe-yuanbao] FAIL: no composer matched. Maybe not logged in.');
    console.log('[probe-yuanbao] dumped /tmp/yuanbao-probe/no-composer.{html,png}');
    await ctx.close();
    return;
  }

  await composer.click();
  await composer.fill(QUESTION);
  console.log('[probe-yuanbao] question typed via', composerSel);

  const sendBtnSelectors = [
    'button[aria-label*="发送"]',
    'button[class*="send-button"]',
    'button[class*="submit"]',
    '[class*="send-btn"] button',
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
          console.log(`[probe-yuanbao] clicked send via: ${sel}`);
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
    console.log('[probe-yuanbao] fell back to Enter');
  }

  console.log('[probe-yuanbao] waiting 50s for streaming response...');
  await page.waitForTimeout(50_000);

  console.log('[probe-yuanbao] dumping page state');
  const html = await page.content();
  await writeFile(`${OUT_DIR}/page.html`, html);
  await page.screenshot({ path: `${OUT_DIR}/page.png`, fullPage: true });

  const candidates = [
    '[class*="agent-chat__bubble"]',
    '[class*="chat-message-ai"]',
    '[class*="ai-message"]',
    '[class*="bot-response"]',
    '[class*="markdown-body"]',
    '[class*="hyc-content-md"]',
    '[class*="hyc-component-reasoner"]',
    '[class*="message-content"]',
    '[class*="answer"]',
    '[class*="response"]',
    '[class*="bubble"]',
    '[class*="reply"]',
    '[data-testid*="message"]',
    '[role="article"]',
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
    const interesting = /message|chat|answer|response|reply|bubble|markdown|hyc-|agent/i;
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
    JSON.stringify({ candidates: results, classNames, inputProbe, composerSel }, null, 2),
  );

  console.log('\n─── selector candidates (chars > 0 = answer text found) ───');
  for (const r of results) {
    console.log(
      `  ${r.selector.padEnd(40)} count=${r.count.toString().padStart(3)} chars=${r.chars.toString().padStart(6)}  ${r.sample}`,
    );
  }
  console.log('\n─── top class names (interesting) ───');
  for (const [c, n] of classNames) {
    console.log(`  ${c.padEnd(50)} ×${n}`);
  }
  console.log(
    `\n[probe-yuanbao] outputs:\n  ${OUT_DIR}/page.html\n  ${OUT_DIR}/page.png\n  ${OUT_DIR}/selectors.json`,
  );

  await ctx.close().catch(() => undefined);
}

main().catch((err) => {
  console.error('[probe-yuanbao] fatal:', err);
  process.exit(1);
});
