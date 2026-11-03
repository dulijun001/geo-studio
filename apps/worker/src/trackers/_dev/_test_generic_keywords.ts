import { launchPersistentContext } from 'cloakbrowser';
import { homedir } from 'node:os';
import { join } from 'node:path';

// 纯真实泛大词测试集（绝不带西山区、绝不是文章长标题，全部是患者真实最高频搜索词）
const GENERIC_QUESTIONS = [
  '昆明种植牙哪家医院好？',
  '昆明牙齿矫正推荐哪家医院？',
  '昆明看牙哪家医院比较好？',
  '昆明正规牙科医院有哪些推荐？'
];

async function main() {
  const userDataDir = join(homedir(), '.config', 'geo-tracking', 'doubao', 'mac-local');
  const context = await launchPersistentContext({
    userDataDir,
    headless: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());

  const results: any[] = [];

  for (const q of GENERIC_QUESTIONS) {
    console.log(`\n========================================`);
    console.log(`[泛大词测试] ${q}`);
    console.log(`========================================`);

    await page.goto('https://www.doubao.com/chat/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const inputLocator = page.locator('div.tiptap.ProseMirror[contenteditable="true"]');
    await inputLocator.click();
    await page.keyboard.type(q, { delay: 30 });
    await page.keyboard.press('Enter');

    // 等待生成结束
    await page.waitForTimeout(5000);
    const stopLocator = page.locator('button:has-text("停止生成"), [data-testid="stop_button"], button:has-text("暂停")');
    let waitLoops = 0;
    while (waitLoops < 25) {
      const isGenerating = (await stopLocator.count()) > 0;
      if (!isGenerating && waitLoops > 2) break;
      await page.waitForTimeout(1000);
      waitLoops++;
    }
    await page.waitForTimeout(2000);

    // 获取回答正文
    const answer = await page.evaluate(() => {
      const messages = Array.from(document.querySelectorAll('div[data-testid="message_content"], .markdown-body, div.message-content'));
      if (messages.length > 0) {
        return messages[messages.length - 1].innerText || '';
      }
      return document.body.innerText;
    });

    // 研判各大品牌是否出现
    const brands = [
      { name: '松鼠口腔', hit: /松鼠/i.test(answer) },
      { name: '柏德口腔', hit: /柏德/i.test(answer) },
      { name: '德韩口腔', hit: /德韩/i.test(answer) },
      { name: '美奥口腔', hit: /美奥/i.test(answer) },
      { name: '昆医大/省口腔', hit: /昆医|云南省口腔|医大/i.test(answer) },
      { name: '团圆口腔', hit: /团圆/i.test(answer) },
      { name: '蓝橙口腔', hit: /蓝橙/i.test(answer) },
      { name: '尚爱韩美', hit: /尚爱韩美|韩美/i.test(answer) }
    ];

    console.log(`[回答长度] ${answer.length} 字`);
    console.log(`[松鼠口腔是否命中] -> ${/松鼠/i.test(answer) ? '✅ 命中' : '❌ 未命中'}`);
    console.log(`[所有命中品牌] -> ${brands.filter(b => b.hit).map(b => b.name).join(', ')}`);
    
    // 截取回答中关于各民营机构的具体推荐原句
    results.push({
      question: q,
      hitSongshu: /松鼠/i.test(answer),
      hitBrands: brands.filter(b => b.hit).map(b => b.name),
      snippet: answer.slice(0, 500)
    });
  }

  console.log('\n\n=== 最终泛大词对照测试汇总 ===');
  console.log(JSON.stringify(results, null, 2));

  await context.close();
}

main().catch(console.error);
