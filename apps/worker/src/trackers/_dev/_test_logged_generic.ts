import { launchPersistentContext } from 'cloakbrowser';
import { homedir } from 'node:os';
import { join } from 'node:path';

// 纯真实泛大词测试集（绝不带西山区、绝不是文章长标题）
const GENERIC_QUESTIONS = [
  '昆明种植牙哪家医院好？',
  '昆明牙齿矫正推荐哪家医院？'
];

async function main() {
  const userDataDir = join(homedir(), '.config', 'geo-tracking', 'doubao', 'mac-local');
  const context = await launchPersistentContext({
    userDataDir,
    headless: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());

  for (const q of GENERIC_QUESTIONS) {
    console.log(`\n========================================`);
    console.log(`[泛大词新对话测试] ${q}`);
    console.log(`========================================`);

    // 每次点击新对话按钮或直接重新打开带新对话的链接
    await page.goto('https://www.doubao.com/chat/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 如果弹出了登录框，先按 Escape 或点关闭
    const closeBtn = page.locator('[aria-label="Close"], button:has-text("关闭"), .close-icon');
    if ((await closeBtn.count()) > 0) {
      await closeBtn.first().click().catch(() => {});
    }

    // 点击“新对话”按钮
    const newChatBtn = page.locator('text=/新对话/').first();
    if (await newChatBtn.isVisible()) {
      await newChatBtn.click();
      await page.waitForTimeout(1500);
    }

    const inputLocator = page.locator('div.tiptap.ProseMirror[contenteditable="true"]');
    await inputLocator.click();
    await inputLocator.fill(q);
    await page.keyboard.press('Enter');
    console.log('已输入并回车发送，等待豆包检索网络与生成完整回答...');

    // 等待生成
    await page.waitForTimeout(16000);

    // 获取当前对话区里的最后一条回答
    const result = await page.evaluate(() => {
      const msgs = document.querySelectorAll('[data-testid="message_content"], .markdown-body');
      if (msgs.length > 0) {
        return msgs[msgs.length - 1].textContent || '';
      }
      return document.body.innerText;
    });

    console.log(`[回答实际文本长度]: ${result.length}`);
    console.log(`[是否提及松鼠口腔]: ${/松鼠/.test(result) ? '✅ 出现' : '❌ 未出现'}`);
    console.log(`[是否提及柏德口腔]: ${/柏德/.test(result) ? '✅ 出现' : '❌ 未出现'}`);
    console.log(`[是否提及德韩口腔]: ${/德韩/.test(result) ? '✅ 出现' : '❌ 未出现'}`);
    console.log(`[是否提及昆医大/省口腔]: ${/昆医|省口腔/.test(result) ? '✅ 出现' : '❌ 未出现'}`);

    console.log('\n--- 完整回答内容预览 ---');
    console.log(result.slice(0, 1000).replace(/\n\s*\n/g, '\n'));
  }

  await context.close();
}

main().catch(console.error);
