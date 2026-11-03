import { chromium } from 'playwright';

const GENERIC_QUESTIONS = [
  '昆明种植牙哪家医院好？',
  '昆明牙齿矫正推荐哪家医院？'
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  // 模拟真实桌面 Chrome
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  for (const q of GENERIC_QUESTIONS) {
    console.log(`\n>>> 测试无登录真实大词: ${q}`);
    await page.goto('https://www.doubao.com/chat/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const input = page.locator('div.tiptap.ProseMirror[contenteditable="true"]');
    await input.click();
    await input.fill(q);
    await page.keyboard.press('Enter');

    // 观察回答生成
    await page.waitForTimeout(8000);

    // 抓取回答内容
    const answer = await page.evaluate(() => {
      // 提取最新的回答段落
      const elements = Array.from(document.querySelectorAll('[data-testid="message_content"], .markdown-body, [class*="message_content"]'));
      if (elements.length > 0) {
        return elements[elements.length - 1].textContent || '';
      }
      return document.body.textContent || '';
    });

    console.log(`回答字数: ${answer.length}`);
    console.log('包含品牌检视:');
    console.log('- 松鼠口腔:', /松鼠/.test(answer));
    console.log('- 柏德口腔:', /柏德/.test(answer));
    console.log('- 德韩口腔:', /德韩/.test(answer));
    console.log('- 昆医大/省口腔:', /昆医|省口腔/.test(answer));
    console.log('回答截取:\n', answer.slice(0, 400).replace(/\s+/g, ' '));
  }

  await browser.close();
}

main().catch(console.error);
