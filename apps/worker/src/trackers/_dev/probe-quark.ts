/**
 * Probe 夸克 AI 搜索的真实 DOM(2026-09-12)。
 *
 * 选夸克的理由:实测它**不需要登录**(loginText=0/modalNodes=0),
 * 而元宝和 DeepSeek 都被登录弹窗挡死、必须人扫码。
 *
 * 输出:/tmp/quark-probe/{page.html,page.png,selectors.json}
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { launchPersistentContext } from 'cloakbrowser';
import { homedir } from 'node:os';
import { join } from 'node:path';

const QUESTION = '昆明西山区种牙哪家口腔医院比较正规?';
const OUT = '/tmp/quark-probe';

async function main() {
  await mkdir(OUT, { recursive: true });
  const userDataDir = join(homedir(), '.cache', 'geo-tracker', 'quark');
  await mkdir(userDataDir, { recursive: true });

  const ctx = await launchPersistentContext({
    userDataDir,
    headless: false,
    viewport: { width: 1280, height: 950 },
    args: ['--lang=zh-CN'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  // 2026-09-12:quark.sm.cn 根页是触屏版精简搜索框,输入框拿不到焦点、回车也不提交。
  // 改成直接带 query 进结果页,绕开输入交互 —— 搜索引擎类目标本来就该这么打。
  const url = `https://quark.sm.cn/s?q=${encodeURIComponent(QUESTION)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(3000);
  console.log('[probe-quark] 已进结果页,等 AI 摘要…');

  // 等答案:轮询正文长度稳定
  let last = 0;
  let stable = 0;
  for (let i = 0; i < 60; i += 1) {
    await page.waitForTimeout(1500);
    const len = (await page.locator('body').innerText().catch(() => '')).length;
    if (len === last && len > 600) stable += 1;
    else stable = 0;
    last = len;
    if (stable >= 3) break;
  }
  console.log(`[probe-quark] body length=${last}, url=${page.url()}`);

  const text = await page.locator('body').innerText();
  await writeFile(`${OUT}/page.txt`, text);
  await writeFile(`${OUT}/page.html`, await page.content());
  await page.screenshot({ path: `${OUT}/page.png`, fullPage: false });

  // 试一批常见容器,看哪个能捞到 AI 答案
  const cands = [
    '[class*="ai-answer"]', '[class*="aiAnswer"]', '[class*="summary"]',
    '[class*="answer"]', '[class*="markdown"]', '[class*="gpt"]',
    '[class*="sc-"]', 'main', 'article',
  ];
  const hits: Record<string, number> = {};
  for (const c of cands) {
    const n = await page.locator(c).count();
    if (n > 0) {
      const t = await page.locator(c).first().innerText().catch(() => '');
      hits[c] = t.length;
    }
  }
  await writeFile(`${OUT}/selectors.json`, JSON.stringify(hits, null, 2));
  console.log('[probe-quark] selector 命中(字数):', JSON.stringify(hits));
  console.log(`[probe-quark] 正文前 400 字:\n${text.slice(0, 400)}`);

  await ctx.close();
}

main().catch((e) => {
  console.error('[probe-quark] fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
