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
  
  const inputs = await page.evaluate(() => {
    const list = Array.from(document.querySelectorAll('input, [contenteditable="true"], div[role="textbox"]'));
    return list.map(el => ({
      tagName: el.tagName,
      contentEditable: el.getAttribute('contenteditable'),
      role: el.getAttribute('role'),
      placeholder: el.getAttribute('placeholder'),
      className: el.className,
      id: el.id,
    }));
  });
  console.log('Inputs found:', JSON.stringify(inputs, null, 2));
  await context.close();
}
main().catch(console.error);
