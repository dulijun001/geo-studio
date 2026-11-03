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
  
  // 查找左侧所有对话历史条目
  const chatTitles = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('div, a'))
      .map(el => el.innerText?.trim())
      .filter(t => t && t.length > 4 && t.length < 30);
  });
  console.log('Chat titles found:', Array.from(new Set(chatTitles)).slice(0, 15));
  
  await context.close();
}
main().catch(console.error);
