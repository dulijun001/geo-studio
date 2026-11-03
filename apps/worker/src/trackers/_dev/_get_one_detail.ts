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
  
  // 点击“大学生牙齿矫正分期及昆明机构咨询”
  const item = await page.locator('text=/大学生牙齿矫正分期/').first();
  await item.click();
  await page.waitForTimeout(3000);
  
  const text = await page.evaluate(() => document.body.innerText);
  console.log('=== 大学生矫正详细回答 ===');
  console.log(text.slice(0, 2000));
  
  await context.close();
}
main().catch(console.error);
