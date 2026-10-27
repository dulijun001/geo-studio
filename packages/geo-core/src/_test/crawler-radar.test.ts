import assert from 'node:assert';
import {
  CRAWLER_REGISTRY,
  AI_REFERRER_SOURCES,
  identifyCrawler,
  verifyCrawlerIp,
  identifyReferrer,
  isIpInCidr,
} from '../discoverability/crawler-radar';

console.log('🧪 开始运行 Crawler Radar & GEOInflow 识别规则断言测试...');

// 1. 测试国内爬虫 UA 识别
const bytespider = identifyCrawler(
  'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; https://zhanzhang.toutiao.com/)'
);
assert(bytespider !== null, '应该成功识别 Bytespider');
assert.strictEqual(bytespider?.platform, 'bytedance');
assert.strictEqual(bytespider?.vendor, '字节跳动');
assert.strictEqual(bytespider?.isDomestic, true);

const kimibot = identifyCrawler(
  'Mozilla/5.0 (compatible; KimiBot/1.0; +https://www.kimi.ai/policies/kimibot.json)'
);
assert(kimibot !== null, '应该成功识别 KimiBot');
assert.strictEqual(kimibot?.platform, 'kimi');
assert.strictEqual(kimibot?.purpose, 'ai_training');

const baiduspider = identifyCrawler(
  'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)'
);
assert(baiduspider !== null, '应该成功识别 Baiduspider');
assert.strictEqual(baiduspider?.purpose, 'traditional_search');

// 2. 测试国际爬虫 UA 识别
const gptbot = identifyCrawler(
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)'
);
assert(gptbot !== null, '应该成功识别 GPTBot');
assert.strictEqual(gptbot?.platform, 'openai');
assert.strictEqual(gptbot?.isDomestic, false);

// 3. 测试空 UA 与未知爬虫
assert.strictEqual(identifyCrawler(''), null);
assert.strictEqual(identifyCrawler('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)'), null);

// 4. 测试 IP CIDR 范围判断
assert.strictEqual(isIpInCidr('47.79.225.241', '47.79.225.241/32'), true);
assert.strictEqual(isIpInCidr('47.79.225.242', '47.79.225.241/32'), false);
assert.strictEqual(isIpInCidr('43.144.87.15', '43.144.87.0/24'), true);
assert.strictEqual(isIpInCidr('43.144.89.1', '43.144.87.0/24'), false);

// 5. 测试官方 IP 真实度验证 (防伪造)
if (kimibot) {
  const verified = verifyCrawlerIp(kimibot, '47.79.225.241');
  assert.strictEqual(verified.verified, true);
  assert.strictEqual(verified.status, 'verified');

  const spoofed = verifyCrawlerIp(kimibot, '1.2.3.4');
  assert.strictEqual(spoofed.verified, false);
  assert.strictEqual(spoofed.status, 'unverified');
}

// 6. 测试 AI 搜索 Referrer 识别
const doubaoRef = identifyReferrer('https://www.doubao.com/chat/conversation-1234');
assert(doubaoRef !== null, '应该成功识别豆包 Referrer');
assert.strictEqual(doubaoRef?.platform, 'doubao');
assert.strictEqual(doubaoRef?.name, '豆包');
assert.strictEqual(doubaoRef?.type, 'ai_search');
assert.strictEqual(doubaoRef?.isDomestic, true);

const metasoRef = identifyReferrer('https://metaso.cn/?q=%E6%9D%86%E6%98%8E%E7%A7%8D%E7%89%99');
assert(metasoRef !== null, '应该成功识别秘塔 AI 搜索');
assert.strictEqual(metasoRef?.platform, 'metaso');

const chatgptRef = identifyReferrer('https://chatgpt.com/g/g-abc123');
assert(chatgptRef !== null, '应该成功识别 ChatGPT Referrer');
assert.strictEqual(chatgptRef?.isDomestic, false);

const baiduNormalRef = identifyReferrer('https://www.baidu.com/s?wd=%E7%A7%8D%E7%89%99');
assert(baiduNormalRef !== null, '应该成功识别百度传统搜索');
assert.strictEqual(baiduNormalRef?.type, 'traditional_search');

console.log('✅ 所有断言全部通过！Crawler Radar 核心模块工作正常。');
