import { launchPersistentContext } from 'cloakbrowser';
import { homedir } from 'node:os';
import { join } from 'node:path';

async function main() {
  const q = '昆明种植牙医院排名榜前十';
  const userDataDir = join(homedir(), '.config', 'geo-tracking', 'doubao', 'mac-local');
  const context = await launchPersistentContext({
    userDataDir,
    headless: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto('https://www.doubao.com/chat/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  
  const editor = await page.$('div.ProseMirror[contenteditable="true"]');
  if (!editor) return;
  await editor.click();
  await page.keyboard.type(q, { delay: 50 });
  await page.waitForTimeout(800);
  await page.keyboard.press('Enter');
  
  // 等待回答
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(2000);
    const isGenerating = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, div')).some(el => (el.textContent || '').includes('停止'));
    });
    const text = await page.evaluate(() => document.body.innerText);
    if (i > 8 && !isGenerating && text.length > 800) break;
  }
  
  const data = await page.evaluate(() => {
    // 抓取参考资料展开
    return {
      text: document.body.innerText,
      html: document.body.innerHTML,
    };
  });
  
  console.log('=== 回答片段 ===');
  console.log(data.text.slice(0, 1500));
  
  const brands = ['松鼠', '柏德', '德韩', '美奥', '蓝橙', '团圆', '尚爱韩美', '昆医', '医大'];
  for (const b of brands) {
    console.log(`品牌 [${b}]: ${data.text.includes(b) ? '✅ 命中' : '❌ 未提及'}`);
  }
  
  await context.close();
}
main().catch(console.error);
