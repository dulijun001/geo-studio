/**
 * Headful Doubao login helper.
 *
 * Why this exists: starting around 2026-04 Doubao silently drops chat submits
 * from guest sessions. The tracker needs an authenticated cookie. This script
 * opens a real Chrome window backed by the same persistent userDataDir the
 * tracker uses, navigates to doubao.com/chat, and waits for the user to log
 * in by hand (扫码 or 手机+验证码). Once the URL flips past the welcome
 * screen, we declare success and let the user close the window.
 *
 * Usage:
 *   pnpm --filter @geo/worker exec tsx src/trackers/dev-doubao-login.ts
 *
 * The login state survives across runs because Chrome writes its
 * cookies/localStorage into userDataDir = ~/.cache/geo-tracker/doubao/.
 * Doubao login ttl is ~60-90 days; re-run this whenever the tracker starts
 * reporting "login required".
 */
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const CHAT_URL = 'https://www.doubao.com/chat/';

function getUserDataDir(): string {
  return process.env.GEO_DOUBAO_USERDATA || join(homedir(), '.cache', 'geo-tracker', 'doubao');
}

async function main() {
  const userDataDir = getUserDataDir();
  await mkdir(userDataDir, { recursive: true });

  console.log(`[doubao-login] using userDataDir: ${userDataDir}`);
  console.log('[doubao-login] launching headful Chrome...');

  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(CHAT_URL, { waitUntil: 'domcontentloaded' });

  console.log('\n┌────────────────────────────────────────────────────────────┐');
  console.log('│  浏览器已打开,请你在窗口里:                                │');
  console.log('│  1. 点右上角「登录」                                        │');
  console.log('│  2. 选你方便的方式登录(扫码 / 手机号验证码)                │');
  console.log('│  3. 登录完成后,系统自动检测,无需关窗口                    │');
  console.log('│                                                            │');
  console.log('│  超时:6 分钟未登录会自动退出                               │');
  console.log('└────────────────────────────────────────────────────────────┘\n');

  const deadline = Date.now() + 6 * 60_000;
  let success = false;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    // Heuristic: when logged in, the "登录" button in the topbar disappears
    // OR the page exposes user-avatar / user-menu elements. Check both.
    const stillNotLoggedIn = await page
      .evaluate(() => {
        // Look for visible "登录" button in topbar
        const buttons = Array.from(document.querySelectorAll('button, a'));
        return buttons.some((b) => {
          const txt = (b.textContent || '').trim();
          if (txt !== '登录') return false;
          const rect = b.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      })
      .catch(() => true);
    if (!stillNotLoggedIn) {
      success = true;
      break;
    }
  }

  if (success) {
    console.log('\n✓ 登录态检测成功!cookie 已保存到:');
    console.log(`  ${userDataDir}`);
    console.log('\n  追踪 worker 会自动复用这个登录态。可以关闭浏览器了。');
    console.log('  如需验证,运行:pnpm --filter @geo/worker exec tsx src/trackers/dev-smoke.ts "测试问题"');
  } else {
    console.log('\n✗ 6 分钟内没检测到登录。再次运行此脚本重试。');
  }

  // Give the user a moment to see the message before we close
  await page.waitForTimeout(3000);
  await ctx.close();
}

main().catch((err) => {
  console.error('[doubao-login] fatal:', err);
  process.exit(1);
});
