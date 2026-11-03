import { launchPersistentContext } from 'cloakbrowser';
import { homedir } from 'node:os';
import { join } from 'node:path';

const QUESTIONS = [
  '昆明西山区种植牙哪家口腔医院比较好？',
  '昆明种植牙医院排名榜前十',
  '昆明树脂补牙哪里好？',
  '昆明哪家正规的医院补牙补的比较好？',
  '昆明正畸医院哪家好一点？',
  '昆明儿童牙科医院哪家比较好？',
  '大学生牙齿矫正可以分期吗?昆明哪里能做?',
  '昆明牙科医院哪家比较好？',
];

const BRANDS = [
  { name: '松鼠口腔', aliases: ['松鼠', '松鼠口腔'] },
  { name: '柏德口腔', aliases: ['柏德', '柏德口腔'] },
  { name: '德韩口腔', aliases: ['德韩', '德韩口腔'] },
  { name: '美奥口腔', aliases: ['美奥', '美奥口腔'] },
  { name: '蓝橙口腔', aliases: ['蓝橙', '蓝橙口腔'] },
  { name: '团圆口腔', aliases: ['团圆', '团圆口腔'] },
  { name: '尚爱韩美口腔', aliases: ['尚爱韩美', '韩美'] },
  { name: '昆医大/省口腔(公立)', aliases: ['昆医', '云南省口腔医院'] },
  { name: '920医院(公立)', aliases: ['九二〇', '920'] },
];

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

  const results = [];

  for (let qIdx = 0; qIdx < QUESTIONS.length; qIdx++) {
    const q = QUESTIONS[qIdx];
    console.log(`\n[${qIdx + 1}/${QUESTIONS.length}] 正在实时抓取: "${q}"...`);
    
    // 点击“新对话”或者直接用输入框
    const newChatBtn = await page.$('text=新对话');
    if (newChatBtn) {
      await newChatBtn.click().catch(() => {});
      await page.waitForTimeout(1500);
    }
    
    const editor = await page.$('div.ProseMirror[contenteditable="true"]');
    if (!editor) {
      console.log('未找到编辑器，跳过');
      continue;
    }
    
    await editor.click();
    await page.keyboard.type(q, { delay: 30 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    
    // 等待生成完成
    let fullText = '';
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(2000);
      const isGenerating = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button, div')).some(el => (el.textContent || '').includes('停止'));
      });
      fullText = await page.evaluate(() => document.body.innerText);
      if (i > 8 && !isGenerating && fullText.length > 600) break;
    }
    
    // 尝试点击“参考 X 篇资料”抓取外链
    let citedUrls: string[] = [];
    try {
      const loc = page.locator('text=/参考\\s*\\d+\\s*篇资料/').last();
      const count = await loc.count();
      if (count > 0) {
        await loc.click({ force: true, timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(2000);
        citedUrls = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href]'))
            .map(a => a.href)
            .filter(h => h.startsWith('http') && !h.includes('doubao.com'));
        });
      }
    } catch (e) {}

    // 统计命中品牌
    const mentionedBrands = BRANDS.filter(b => b.aliases.some(a => fullText.includes(a))).map(b => b.name);
    
    console.log(`  -> 生成完成，字数: ${fullText.length}，引用外链: ${citedUrls.length}条`);
    console.log(`  -> 提及机构: ${mentionedBrands.join(', ') || '无品牌提及'}`);
    
    results.push({
      question: q,
      brands: mentionedBrands,
      citations: citedUrls,
      snippet: fullText.slice(0, 300).replace(/\n+/g, ' '),
    });
  }

  console.log('\n================== 🎯 8 题实时真机抓取汇总 ==================');
  console.log(JSON.stringify(results, null, 2));
  await context.close();
}

main().catch(console.error);
