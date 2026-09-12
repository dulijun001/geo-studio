/**
 * Profile 体检 —— 10 秒回答「这个 tracker 的 userDataDir 还能用吗、还有登录态吗」。
 *
 * 2026-09-11 加:元宝/DeepSeek 的 profile(4-30 建)双双损坏,CloakBrowser 一起
 * 就 SIGTRAP 崩,报错长得像 selector 问题其实不是。先跑这个分清「profile 坏」
 * vs 「没登录」vs 「selector 没命中」三种病,别再一路猜到 probe。
 *
 * Usage:
 *   pnpm --filter @geo/worker exec tsx src/trackers/_dev/_profile-health.ts \
 *     ~/.cache/geo-tracker/yuanbao https://yuanbao.tencent.com/chat
 *
 * 读结果:
 *   ok:false + "browser has been closed"  → profile 坏了,挪走重建
 *   ok:true  + loginText>0 / modalNodes>0 → profile 好,但没登录态,要人扫码
 *   ok:true  + loginText=0                → 登录态在,可以直接跑 probe
 */
import { launchPersistentContext } from 'cloakbrowser';

const dir = process.argv[2] ?? '';
const url = process.argv[3] ?? '';
if (!dir || !url) {
  console.error('Usage: _profile-health.ts <userDataDir> <url>');
  process.exit(2);
}

(async () => {
  const ctx = await launchPersistentContext({
    userDataDir: dir,
    headless: false,
    viewport: { width: 1100, height: 800 },
    args: ['--lang=zh-CN'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(5000);
  const modalNodes = await page.locator('[class*="dialog"],[class*="modal"],[class*="login"]').count();
  console.log(
    `RESULT ${JSON.stringify({
      ok: true,
      title: await page.title(),
      url: page.url(),
      loginText: await page.locator('text=登录').count(),
      modalNodes,
    })}`,
  );
  await ctx.close();
})().catch((e) => {
  console.log(`RESULT ${JSON.stringify({ ok: false, err: String(e).slice(0, 160) })}`);
  process.exit(1);
});
