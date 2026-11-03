import { launchPersistentContext } from 'cloakbrowser';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GENERIC_QUESTIONS = [
  '昆明种植牙哪家医院好？',
  '昆明牙齿矫正推荐哪家医院？'
];

async function main() {
  // 使用纯净的临时目录，完全无历史、无缓存
  const tempDir = mkdtempSync(join(tmpdir(), 'doubao-clean-'));
  const context = await launchPersistentContext({
    userDataDir: tempDir,
    headless: true,
    viewport: { width: 1280, height: 800 }
  });
  const page = context.pages()[0] ?? (await context.newPage());

  for (const q of GENERIC_QUESTIONS) {
    console.log(`\n==============================================`);
    console.log(`>>> 纯净无历史会话测试: [${q}]`);
    console.log(`==============================================`);

    await page.goto('https://www.doubao.com/chat/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const input = page.locator('div.tiptap.ProseMirror[contenteditable="true"]');
    await input.click();
    await input.fill(q);
    await page.keyboard.press('Enter');

    console.log('已提交问题，等待大模型流式输出与搜索完成...');
    // 等待 15 秒大模型搜索和完整作答
    await page.waitForTimeout(15000);

    const answer = await page.evaluate(() => {
      // 提取回复消息
      const items = Array.from(document.querySelectorAll('[data-testid="message_content"], .markdown-body, div[class*="message-content"]'));
      if (items.length > 0) {
        return items[items.length - 1].innerText;
      }
      return document.body.innerText;
    });

    console.log(`[回答实际有效字数]: ${answer.length}`);
    console.log(`[松鼠口腔命中]: ${/松鼠/.test(answer) ? '✅ 命中' : '❌ 未提及'}`);
    console.log(`[柏德口腔命中]: ${/柏德/.test(answer) ? '✅ 命中' : '❌ 未提及'}`);
    console.log(`[德韩口腔命中]: ${/德韩/.test(answer) ? '✅ 命中' : '❌ 未提及'}`);
    console.log(`[美奥口腔命中]: ${/美奥/.test(answer) ? '✅ 命中' : '❌ 未提及'}`);
    console.log(`[昆医大/省口腔命中]: ${/昆医|省口腔/.test(answer) ? '✅ 命中' : '❌ 未提及'}`);

    console.log('\n--- 回答实录摘录 ---');
    console.log(answer.slice(0, 800));
  }

  await context.close();
}

main().catch(console.error);
