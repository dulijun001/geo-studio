/**
 * Headful Yuanbao login helper. Same approach as _dev/doubao-login.ts
 * but for yuanbao.tencent.com.
 *
 * Usage: pnpm --filter @geo/worker exec tsx src/trackers/_dev/yuanbao-login.ts
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { getYuanbaoUserDataDir } from '../yuanbao-web';

const CHAT_URL = 'https://yuanbao.tencent.com/chat';

async function main() {
  const userDataDir = getYuanbaoUserDataDir();
  await mkdir(userDataDir, { recursive: true });

  console.log(`[yuanbao-login] using userDataDir: ${userDataDir}`);
  console.log('[yuanbao-login] launching headful Chrome...');

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
  console.log('│  浏览器已打开 yuanbao.tencent.com                           │');
  console.log('│  1. 点登录(微信扫码 / QQ / 手机号都行)                     │');
  console.log('│  2. 登完后系统自动检测                                      │');
  console.log('│  超时 6 分钟                                                │');
  console.log('└────────────────────────────────────────────────────────────┘\n');

  const deadline = Date.now() + 6 * 60_000;
  let success = false;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    // Heuristic: when logged in,顶部「登录」按钮消失
    const stillNotLoggedIn = await page
      .evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        return buttons.some((b) => {
          const txt = (b.textContent || '').trim();
          if (txt !== '登录' && txt !== '登 录') return false;
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
    console.log('\n✓ 登录态检测成功!cookie 已保存。可以关闭浏览器了。');
    console.log('  追踪 worker 会自动复用这个登录态。');
  } else {
    console.log('\n✗ 6 分钟内没检测到登录,再次运行此脚本重试。');
  }

  await page.waitForTimeout(3000);
  await ctx.close();
}

main().catch((err) => {
  console.error('[yuanbao-login] fatal:', err);
  process.exit(1);
});
