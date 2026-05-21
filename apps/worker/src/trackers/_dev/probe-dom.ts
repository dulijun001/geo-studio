/**
 * Dev-only probe: open Doubao, ask a question, wait 30s, dump candidate selectors.
 *
 * Use when the message-list selector in doubao-web.ts stops matching (Doubao
 * tends to rename CSS modules every few weeks). Outputs go to /tmp/doubao-probe.
 *
 * Usage:
 *   pnpm --filter @geo/worker exec tsx src/trackers/_dev/probe-dom.ts
 */
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchPersistentContext } from 'cloakbrowser';

const QUESTION = '昆明儿童涂氟去哪比较好?';
const OUT_DIR = '/tmp/doubao-probe';

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const userDataDir = await mkdtemp(join(tmpdir(), 'doubao-probe-'));
  const ctx = await launchPersistentContext({
    userDataDir,
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: ['--lang=zh-CN'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  console.log('[probe] opening doubao chat');
  await page.goto('https://www.doubao.com/chat/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.keyboard.press('Escape').catch(() => undefined);

  console.log('[probe] looking for composer textarea');
  // Try multiple plausible selectors
  const composerSelectors = [
    'textarea[placeholder*="发消息"]',
    'textarea[placeholder*="问豆包"]',
    'textarea[placeholder*="给豆包"]',
    'textarea',
    '[contenteditable="true"]',
  ];
  let composer = null;
  for (const sel of composerSelectors) {
    try {
      composer = await page.waitForSelector(sel, { timeout: 5000 });
      console.log(`[probe] composer matched: ${sel}`);
      break;
    } catch {
      console.log(`[probe] composer NOT matched: ${sel}`);
    }
  }
  if (!composer) {
    const bodyHtml = await page.content();
    await writeFile(join(OUT_DIR, 'no-composer.html'), bodyHtml);
    await page.screenshot({ path: join(OUT_DIR, 'no-composer.png'), fullPage: true });
    console.log('[probe] FAIL: no composer; dumped /tmp/doubao-probe/no-composer.{html,png}');
    await ctx.close();
    return;
  }

  // Try to dismiss any promo overlay (MacBook Pro popup etc) — they steal Enter key
  await page.keyboard.press('Escape').catch(() => undefined);
  // Click any [aria-label*="close"] or × buttons in fixed-position overlays
  await page.evaluate(() => {
    document.querySelectorAll('button, [role="button"]').forEach((b) => {
      const txt = (b.textContent || '').trim();
      const aria = b.getAttribute('aria-label') || '';
      if (/^(×|✕|关闭|close)$/i.test(txt) || /close|关闭/i.test(aria)) {
        (b as HTMLElement).click();
      }
    });
  });

  await composer.click();
  await composer.fill(QUESTION);
  console.log('[probe] question typed; trying multiple submit strategies');

  // Strategy 1: try to find and click the send button.
  const sendBtnSelectors = [
    '[class*="send-btn-wrapper"] button',
    'button[class*="send-msg-btn"]',
    '[class*="send-btn-wrapper"]',
    'button[type="submit"]',
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
          console.log(`[probe] clicked send via: ${sel}`);
          sent = true;
          break;
        }
      }
    } catch {
      /* try next */
    }
  }
  if (!sent) {
    // Strategy 2: Cmd+Enter / Meta+Enter
    await composer.focus();
    await page.keyboard.press('Meta+Enter').catch(() => undefined);
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter').catch(() => undefined);
    console.log('[probe] no send button, fell back to Enter / Meta+Enter');
  }
  console.log('[probe] waiting 40s for streaming response...');
  await page.waitForTimeout(40_000);

  console.log('[probe] dumping page state');
  const html = await page.content();
  await writeFile(join(OUT_DIR, 'page.html'), html);
  await page.screenshot({ path: join(OUT_DIR, 'page.png'), fullPage: true });

  // Probe candidate selectors and report which match + content length
  const candidates = [
    '[class*="message-list"]',
    '[class*="messageList"]',
    '[class*="chat-list"]',
    '[class*="chat-container"]',
    '[class*="conversation"]',
    '[class*="answer"]',
    '[class*="response"]',
    '[class*="bubble"]',
    '[class*="message-content"]',
    '[class*="messageContent"]',
    '[class*="reply"]',
    '[class*="send-bot"]',
    '[class*="send-message-message"]',
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
  // Also: top 30 distinct class names containing words of interest
  const classNames = await page.evaluate(() => {
    const interesting = /message|chat|answer|response|reply|bubble|conversation|send/i;
    const seen = new Map<string, number>();
    document.querySelectorAll('[class]').forEach((el) => {
      const className = typeof el.className === 'string' ? el.className : '';
      className.split(/\s+/).forEach((c) => {
        if (interesting.test(c)) seen.set(c, (seen.get(c) ?? 0) + 1);
      });
    });
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  });

  await writeFile(
    join(OUT_DIR, 'selectors.json'),
    JSON.stringify({ candidates: results, classNames }, null, 2),
  );

  console.log('\n─── selector candidates (chars > 0 = answer text found) ───');
  for (const r of results) {
    console.log(`  ${r.selector.padEnd(38)} count=${r.count.toString().padStart(3)} chars=${r.chars.toString().padStart(6)}  ${r.sample}`);
  }
  console.log('\n─── top class names (interesting) ───');
  for (const [c, n] of classNames) {
    console.log(`  ${c.padEnd(50)} ×${n}`);
  }

  console.log(`\n[probe] outputs:\n  ${OUT_DIR}/page.html\n  ${OUT_DIR}/page.png\n  ${OUT_DIR}/selectors.json`);

  await ctx.close().catch(() => undefined);
  await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
}

main().catch((err) => {
  console.error('[probe] fatal:', err);
  process.exit(1);
});
