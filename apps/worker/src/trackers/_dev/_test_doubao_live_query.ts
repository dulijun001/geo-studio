import { launchPersistentContext } from 'cloakbrowser';
import { homedir } from 'node:os';
import { join } from 'node:path';

async function main() {
  const q = '昆明树脂补牙哪里好？';
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
  if (!editor) {
    console.log('No editor found!');
    await context.close();
    return;
  }
  
  console.log('Focusing and typing question:', q);
  await editor.click();
  await page.keyboard.type(q, { delay: 50 });
  await page.waitForTimeout(1000);
  
  console.log('Pressing Enter...');
  await page.keyboard.press('Enter');
  
  // 等待回答生成
  console.log('Waiting for answer...');
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(2000);
    const text = await page.evaluate(() => document.body.innerText);
    if (text.includes('昆明') && (text.includes('医院') || text.includes('口腔') || text.includes('诊所'))) {
      console.log(`[Tick ${i}] Detected answer content! Length: ${text.length}`);
    }
    // 检查停止生成按钮是否消失
    const isGenerating = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, div')).some(el => (el.textContent || '').includes('停止'));
    });
    if (i > 5 && !isGenerating && text.length > 500) {
      console.log('Generation completed or stopped!');
      break;
    }
  }
  
  // 提取回答与引用
  const result = await page.evaluate(() => {
    // 查找所有链接
    const links = Array.from(document.querySelectorAll('a'))
      .map(a => a.href)
      .filter(h => h.startsWith('http') && !h.includes('doubao.com'));
    
    // 提取正文文本
    const bodyText = document.body.innerText;
    return {
      links: Array.from(new Set(links)),
      fullText: bodyText,
    };
  });
  
  console.log('=== 实时抓取豆包结果 ===');
  console.log('提取到的外链数:', result.links.length);
  console.log('外链列表:', result.links);
  console.log('正文长度:', result.fullText.length);
  
  // 检查是否包含松鼠口腔及竞品
  const brands = ['松鼠', '柏德', '德韩', '美奥', '蓝橙', '团圆', '尚爱韩美'];
  for (const b of brands) {
    console.log(`品牌 [${b}]: ${result.fullText.includes(b) ? '✅ 命中' : '❌ 未提及'}`);
  }
  
  await page.screenshot({ path: '/tmp/doubao_answered.png' });
  await context.close();
}
main().catch(console.error);
