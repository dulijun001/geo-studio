/**
 * 元宝有没有「参考资料」面板?一次查询同时确认 + 找选择器(2026-09-12)。
 *
 * 背景:元宝 3 次查询引用源全 0。查代码发现 #extract 只捡答案里的 <a href>,
 * 没有豆包 D43-B 那种「点开『参考 N 篇资料』面板再抓链接」的动作 ——
 * 豆包当年也是这样,注释写着「链接不在初始 DOM,历史 123 个快照全空」。
 * 所以「元宝不做检索」很可能是错的结论,得先确认它到底有没有面板。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { launchPersistentContext } from 'cloakbrowser';

const Q = '昆明西山区种牙哪家口腔医院比较正规?';
const OUT = '/tmp/yuanbao-sources';

async function main() {
  await mkdir(OUT, { recursive: true });
  const ctx = await launchPersistentContext({
    userDataDir: process.env.GEO_YUANBAO_USERDATA || join(homedir(), '.cache', 'geo-tracker', 'yuanbao'),
    headless: false,
    viewport: { width: 1280, height: 950 },
    args: ['--lang=zh-CN'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto('https://yuanbao.tencent.com/chat', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(3000);

  await page.locator('[contenteditable="true"]').first().click();
  await page.keyboard.type(Q, { delay: 25 });
  await page.waitForTimeout(500);
  const send = page.locator('[class*="SendButton_sendButton"], [class*="sendButton"]').first();
  if (await send.count()) await send.click().catch(() => undefined);
  else await page.keyboard.press('Enter');

  let last = 0, stable = 0;
  for (let i = 0; i < 45; i += 1) {
    await page.waitForTimeout(2000);
    const len = (await page.locator('body').innerText()).length;
    if (len === last && len > 800) stable += 1; else stable = 0;
    last = len;
    if (stable >= 4) break;
  }
  console.log(`[src] 答案稳定,正文 ${last} 字`);

  // 找「参考资料 / 来源 / 引用」这类可展开入口
  const hints = ['参考资料', '参考', '来源', '引用', '资料来源', '搜索来源', '网页'];
  for (const h of hints) {
    const n = await page.locator(`text=${h}`).count();
    if (n > 0) console.log(`[src] 发现文案「${h}」×${n}`);
  }
  const before = await page.locator('a[href^="http"]').count();
  console.log(`[src] 展开前页面外链数: ${before}`);

  for (const h of ['参考资料', '资料来源', '来源', '参考']) {
    const el = page.locator(`text=${h}`).first();
    if ((await el.count()) === 0) continue;
    await el.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(2500);
    const after = await page.locator('a[href^="http"]').count();
    console.log(`[src] 点「${h}」后外链数: ${after}`);
    if (after > before) {
      const urls = await page.locator('a[href^="http"]').evaluateAll((as) =>
        (as as HTMLAnchorElement[]).map((a) => a.href).slice(0, 15),
      );
      console.log('[src] ✅ 抓到链接样本:');
      for (const u of urls.slice(0, 8)) console.log(`      ${u}`);
      break;
    }
  }
  await writeFile(`${OUT}/page.html`, await page.content());
  await page.screenshot({ path: `${OUT}/page.png` });
  console.log(`[src] 现场留在 ${OUT}`);
  await ctx.close();
}
main().catch((e) => { console.error('[src] fatal:', e instanceof Error ? e.message : e); process.exit(1); });
