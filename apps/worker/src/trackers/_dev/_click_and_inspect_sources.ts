import { launchPersistentContext } from 'cloakbrowser';
import { homedir } from 'node:os';
import { join } from 'node:path';

async function main() {
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
  const chatItem = await page.$('text=昆明松鼠口腔医院正规性及种植牙评价');
  if (chatItem) {
    await chatItem.click();
    await page.waitForTimeout(3000);
  }
  
  // 打印带有“参考”或“资料”的元素
  const refElements = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    return all
      .filter(el => /参考\s*\d+\s*篇资料/.test(el.textContent || '') && el.children.length === 0)
      .map(el => ({
        tag: el.tagName,
        text: el.textContent?.trim(),
        className: el.className,
      }));
  });
  console.log('Ref elements:', refElements);
  
  // 点击该元素
  const loc = page.locator('text=/参考\\s*\\d+\\s*篇资料/').first();
  console.log('Clicking locator...');
  await loc.click();
  await page.waitForTimeout(3000);
  
  // 查找抽屉或弹出框里的链接
  const popupLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]'))
      .map(a => ({
        text: a.innerText.trim(),
        href: a.href,
        visible: (a as HTMLElement).offsetWidth > 0,
      }))
      .filter(a => a.href.startsWith('http') && !a.href.includes('doubao.com'));
  });
  console.log('Popup links found:', popupLinks);
  
  await page.screenshot({ path: '/tmp/doubao_sources_opened.png' });
  await context.close();
}
main().catch(console.error);
