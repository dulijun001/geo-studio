import { launchPersistentContext } from 'cloakbrowser';
import { homedir } from 'node:os';
import { join } from 'node:path';

async function main() {
  const q = '昆明西山区松鼠口腔医院正规吗？做种植牙怎么样？';
  const userDataDir = join(homedir(), '.config', 'geo-tracking', 'doubao', 'mac-local');
  const context = await launchPersistentContext({
    userDataDir,
    headless: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto('https://www.doubao.com/chat/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  
  // 查找历史记录中刚才的那一题，点击进去看它的参考资料
  const chatItem = await page.$('div:has-text("昆明松鼠口腔医院正规性及种植牙评价")');
  if (chatItem) {
    await chatItem.click();
    await page.waitForTimeout(3000);
  }
  
  // 查找“参考 X 篇资料”或者类似按钮并点击
  const refBtn = await page.$('text=/参考.*篇资料/');
  if (refBtn) {
    console.log('Found ref button, clicking...');
    await refBtn.click();
    await page.waitForTimeout(2000);
  }
  
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .map(a => ({ text: a.innerText.trim(), href: a.href }))
      .filter(l => l.href.startsWith('http') && !l.href.includes('doubao.com'));
  });
  
  console.log('=== 提取到的参考资料外链 ===');
  console.log(JSON.stringify(links, null, 2));
  
  await context.close();
}
main().catch(console.error);
