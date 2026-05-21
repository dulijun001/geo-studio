/**
 * noVNC 现场扫码登录豆包 — 在 ECS 上启动 headful 浏览器,你通过 noVNC
 * 扫码,cookie 落到 ECS 的 userDataDir(同 production worker 共享)。
 *
 * 跑法:
 *   DISPLAY=:99 pnpm --filter @geo/worker exec tsx --env-file=/opt/geo-studio/.env.production \
 *     src/_dev/novnc-login.ts
 *
 * 浏览器开 5 分钟,你在 noVNC 里点登录 → 选抖音 / 手机验证码 → 扫码或输验证。
 * 5 分钟后自动关闭 + 保存 cookie。
 */
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { launchPersistentContext } from 'cloakbrowser';

const CHAT_URL = 'https://www.doubao.com/chat/';

async function main() {
  const userDataDir = process.env.GEO_DOUBAO_USERDATA || join(homedir(), '.cache', 'geo-tracker', 'doubao');
  await mkdir(userDataDir, { recursive: true });

  console.log(`[novnc-login] userDataDir = ${userDataDir}`);
  console.log(`[novnc-login] launching CloakBrowser on DISPLAY=${process.env.DISPLAY ?? '!unset'}`);

  const ctx = await launchPersistentContext({
    userDataDir,
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--lang=zh-CN'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(CHAT_URL, { waitUntil: 'domcontentloaded' });

  console.log('\n┌──────────────────────────────────────────────────────────────┐');
  console.log('│ 浏览器开了。请你在 noVNC 标签里:                              │');
  console.log('│ 1. 看到豆包页面后点右上角「登录」                              │');
  console.log('│ 2. 选「抖音扫码」(最快)或「手机号 + 验证码」                  │');
  console.log('│ 3. 完成登录                                                   │');
  console.log('│ 4. 等系统检测到登录态(每 2s 自检一次)                       │');
  console.log('│ 5. 看到 "✓ 登录成功" 后,这边自动关闭浏览器,cookie 已落库     │');
  console.log('│                                                              │');
  console.log('│ 超时 8 分钟未登录会自动关闭。                                  │');
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  const deadline = Date.now() + 8 * 60_000;
  let success = false;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    const stillNotLoggedIn = await page
      .evaluate(`(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        return buttons.some((b) => {
          const txt = (b.textContent || '').trim();
          if (txt !== '登录') return false;
          const rect = b.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      })()`)
      .catch(() => true);
    if (!stillNotLoggedIn) {
      success = true;
      break;
    }
  }

  if (success) {
    console.log('\n✓ 登录态检测成功!cookie 已保存到:');
    console.log(`  ${userDataDir}`);
    console.log('  worker 后续追踪会自动复用这个登录态。');
  } else {
    console.log('\n✗ 8 分钟内没检测到登录。再次运行此脚本重试。');
  }

  await page.waitForTimeout(3000);
  await ctx.close();
  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  console.error('[novnc-login] fatal:', err);
  process.exit(1);
});
