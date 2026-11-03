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
  await page.waitForTimeout(5000);
  console.log('Current URL:', page.url());
  const title = await page.title();
  console.log('Title:', title);
  
  const textContent = await page.evaluate(() => document.body.innerText);
  console.log('Page text preview (first 300 chars):', textContent.slice(0, 300).replace(/\n+/g, ' '));
  
  await page.screenshot({ path: '/tmp/doubao_page.png' });
  console.log('Saved screenshot to /tmp/doubao_page.png');
  await context.close();
}
main().catch(console.error);
