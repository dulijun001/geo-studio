import assert from 'node:assert';
import { calculateGEOWeight } from '../discoverability/geo-weight';
import { getAIPlatform, getDomesticPlatforms } from '../discoverability/ai-platforms';

console.log('🧪 开始运行 GEO Weight & AI Platforms 测试...');

// 测试 1: 官方 56,800 权重基准
const res = calculateGEOWeight({
  searchUnits: 3000,
  userUnits: 400,
  trainingUnits: 8000,
});
assert.strictEqual(res.weightedScore, 56800, '权重总分计算不符');
assert.strictEqual(res.level, 6, '权重等级应为 6');
assert.ok(res.description.includes('稳定收录与高频抓取'), '描述文案不符');

// 测试 2: 零值与低值
const zeroRes = calculateGEOWeight({ searchUnits: 0, userUnits: 0, trainingUnits: 0 });
assert.strictEqual(zeroRes.level, 0);

const level1Res = calculateGEOWeight({ searchUnits: 1, userUnits: 0, trainingUnits: 0 });
assert.strictEqual(level1Res.level, 1);

// 测试 3: 平台元数据
const domestic = getDomesticPlatforms();
const ids = domestic.map((p) => p.id);
assert.ok(ids.includes('doubao'));
assert.ok(ids.includes('deepseek'));
assert.ok(ids.includes('kimi'));
assert.ok(ids.includes('yuanbao'));
assert.ok(ids.includes('baidu_wenxin'));

const doubao = getAIPlatform('doubao');
assert.ok(doubao?.operator.includes('Bytedance'));
assert.ok(doubao?.crawlers?.includes('Bytespider'));

console.log('✅ 所有断言全部通过！GEO Weight & AI Platforms 模块工作正常。');

