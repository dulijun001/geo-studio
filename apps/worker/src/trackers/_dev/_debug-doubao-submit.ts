/**
 * 用**真实 profile**（带登录态）复现豆包提交失败,并留下现场(2026-09-12)。
 *
 * 为什么不用 probe-dom.ts:它 mkdtemp 每次新建临时 profile 再删掉,天生未登录,
 * 拿它的截图判断「登录掉没掉」会得到假结论 —— 我今天就误判过一次。
 *
 * 输出 /tmp/doubao-submit/{before,after}.png + after.txt
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { launchPersistentContext } from 'cloakbrowser';
import { homedir } from 'node:os';
import { join } from 'node:path';

// doubao-web.ts 没导出这个函数,这里按同一规则算(见 doubao-web.ts:49)
const getDoubaoUserDataDir = () =>
  process.env.GEO_DOUBAO_USERDATA || join(homedir(), '.cache', 'geo-tracker', 'doubao');

const Q = '昆明西山区种牙哪家口腔医院比较正规?';
const OUT = '/tmp/doubao-submit';

async function main() {
  await mkdir(OUT, { recursive: true });
  const ctx = await launchPersistentContext({
    userDataDir: getDoubaoUserDataDir(),
    headless: false,
    viewport: { width: 1280, height: 950 },
    args: ['--lang=zh-CN'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto('https://www.doubao.com/chat/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(4000);
  console.log(`[dbg] 登录态: loginText=${await page.locator('text=登录').count()}`);

  const composer = page.locator('textarea, [contenteditable="true"]').first();
  await composer.click();
  await page.keyboard.type(Q, { delay: 30 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/before.png` });

  // 列出所有可能的发送键,看哪个可见可点
  for (const sel of [
    '[class*="send-btn-wrapper"] button:not([disabled])',
    '[class*="send-btn-wrapper"]:not([disabled])',
    'button[data-testid*="send"]',
    '[class*="send-btn"]',
  ]) {
    const n = await page.locator(sel).count();
    const vis = n > 0 ? await page.locator(sel).first().isVisible().catch(() => false) : false;
    console.log(`[dbg] ${sel}  count=${n} visible=${vis}`);
  }

  console.log('[dbg] 回车提交');
  await page.keyboard.press('Enter');

  // 等答案真正渲染完:轮询正文长度,连续 4 次不变且 >1200 才算稳
  let last = 0, stable = 0;
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(2000);
    const len = (await page.locator('body').innerText()).length;
    if (len === last && len > 1200) stable += 1; else stable = 0;
    last = len;
    if (stable >= 4) break;
  }
  console.log(`[dbg] 答案稳定,正文长度=${last}, url=${page.url()}`);

  // 答案落在哪个容器里?这才是 adapter 抽取要用的 selector
  const cands = [
    '[class*="message-list"]', '[class*="chat-list"]', '[class*="conversation"]',
    '[class*="answer"]', '[class*="bubble"]', '[class*="message-content"]',
    '[class*="markdown"]', '[class*="paragraph"]', '[data-testid*="message"]',
    '[class*="receive"]', '[class*="assistant"]', 'main',
  ];
  for (const c of cands) {
    const n = await page.locator(c).count();
    if (n === 0) continue;
    const t = await page.locator(c).last().innerText().catch(() => '');
    if (t.length > 200) console.log(`[dbg] ✅ ${c}  count=${n} 末个元素字数=${t.length}`);
  }

  const txt = await page.locator('body').innerText();
  await writeFile(`${OUT}/after.txt`, txt);
  await page.screenshot({ path: `${OUT}/after.png` });
  console.log(`[dbg] 正文含"松鼠": ${txt.includes('松鼠')}`);
  await ctx.close();
}
main().catch((e) => { console.error('[dbg] fatal:', e instanceof Error ? e.message : e); process.exit(1); });
