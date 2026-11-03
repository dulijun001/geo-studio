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
  
  const textarea = await page.$('textarea');
  if (!textarea) {
    console.log('No textarea found!');
    await context.close();
    return;
  }
  console.log('Found textarea!');
  await textarea.fill('昆明树脂补牙哪里好？');
  await page.waitForTimeout(1000);
  
  // 查找发送按钮
  const btnInfo = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.map(b => ({
      text: b.innerText,
      ariaLabel: b.getAttribute('aria-label'),
      className: b.className,
      disabled: b.disabled,
    })).filter(b => b.ariaLabel?.includes('发送') || b.className.includes('send') || b.text.includes('发送'));
  });
  console.log('Send buttons found:', btnInfo);
  
  // 尝试按 Enter
  await page.keyboard.press('Enter');
  console.log('Pressed Enter, waiting 5s...');
  await page.waitForTimeout(5000);
  console.log('URL after Enter:', page.url());
  
  const textContent = await page.evaluate(() => document.body.innerText);
  console.log('Page text preview after Enter:', textContent.slice(0, 400).replace(/\n+/g, ' '));
  
  await page.screenshot({ path: '/tmp/doubao_after_enter.png' });
  await context.close();
}
main().catch(console.error);
