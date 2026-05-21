/**
 * Headful DeepSeek login helper. Same pattern as _dev/doubao-login.ts.
 *
 * Usage: pnpm --filter @geo/worker exec tsx src/trackers/_dev/deepseek-login.ts
 *
 * DeepSeek 支持手机号验证码 / 邮箱密码 / Google / Apple / GitHub 登录。
 * 国内推荐手机号验证码。登录态 cookie 写入 ~/.cache/geo-tracker/deepseek/。
 */
import { mkdir } from 'node:fs/promises';
import { launchPersistentContext } from 'cloakbrowser';
import { getDeepseekUserDataDir } from '../deepseek-web';

const CHAT_URL = 'https://chat.deepseek.com/';

async function main() {
  const userDataDir = getDeepseekUserDataDir();
  await mkdir(userDataDir, { recursive: true });

  console.log(`[deepseek-login] using userDataDir: ${userDataDir}`);
  console.log('[deepseek-login] launching headful Chrome...');

  const ctx = await launchPersistentContext({
    userDataDir,
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--lang=zh-CN'],
  });

  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(CHAT_URL, { waitUntil: 'domcontentloaded' });

  console.log('\n┌────────────────────────────────────────────────────────────┐');
  console.log('│  浏览器已打开 chat.deepseek.com                            │');
  console.log('│  1. 选登录方式(手机号验证码 / 邮箱 / Google)               │');
  console.log('│  2. 登完后系统自动检测                                      │');
  console.log('│                                                            │');
  console.log('│  超时:6 分钟                                                │');
  console.log('└────────────────────────────────────────────────────────────┘\n');

  const deadline = Date.now() + 6 * 60_000;
  let success = false;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    // Heuristic: 登录后页面主体出现 textarea 输入框 + 不再有显眼「登录」按钮
    const loggedIn = await page
      .evaluate(() => {
        const hasTextarea = !!document.querySelector('textarea');
        const stillHasLoginBtn = Array.from(document.querySelectorAll('button, a')).some((b) => {
          const txt = (b.textContent || '').trim();
          if (txt !== '登录' && txt !== 'Log in' && txt !== 'Sign in') return false;
          const rect = (b as HTMLElement).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        return hasTextarea && !stillHasLoginBtn;
      })
      .catch(() => false);
    if (loggedIn) {
      success = true;
      break;
    }
  }

  if (success) {
    console.log('\n✓ 登录态检测成功!cookie 已保存到:');
    console.log(`  ${userDataDir}`);
    console.log('\n  追踪 worker 会自动复用这个登录态。可以关闭浏览器了。');
  } else {
    console.log('\n✗ 6 分钟内没检测到登录,再次运行此脚本重试。');
  }

  await page.waitForTimeout(3000);
  await ctx.close();
}

main().catch((err) => {
  console.error('[deepseek-login] fatal:', err);
  process.exit(1);
});
