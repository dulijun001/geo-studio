/**
 * DeepSeek Tool 客户端单元自检与契约测试
 */
import { DeepSeekToolClient } from '../llm/deepseek-tools';

async function runMockTests() {
  console.log('--- 1. 测试未配置 API Key 时正确报错 ---');
  const clientNoKey = new DeepSeekToolClient({ apiKey: '' });
  try {
    await clientNoKey.search('test query');
    console.error('FAIL: 应抛出未配置错误');
    process.exit(1);
  } catch (err: any) {
    if (err.message.includes('not configured')) {
      console.log('PASS: 未配置 API Key 正确拦截');
    } else {
      console.error('FAIL: 抛出了非预期错误:', err);
      process.exit(1);
    }
  }

  console.log('--- 2. 测试配置判断 ---');
  const configuredClient = new DeepSeekToolClient({ apiKey: 'sk-mock-key-for-test' });
  if (!configuredClient.isConfigured()) {
    console.error('FAIL: isConfigured 判断失败');
    process.exit(1);
  }
  console.log('PASS: isConfigured 逻辑正常');

  console.log('--- 3. 环境变量与端点解析 ---');
  const customUrlClient = new DeepSeekToolClient({
    apiKey: 'sk-mock',
    baseUrl: 'https://custom-api.deepseek.com/v1///',
  });
  // 检验 trailing slash 清理
  // @ts-ignore
  if (customUrlClient.baseUrl !== 'https://custom-api.deepseek.com/v1') {
    // @ts-ignore
    console.error('FAIL: baseUrl 处理有误:', customUrlClient.baseUrl);
    process.exit(1);
  }
  console.log('PASS: baseUrl 尾部斜杠清理正常');

  console.log('--- 所有自检测试通过！---');
}

runMockTests().catch((e) => {
  console.error('Test runner error:', e);
  process.exit(1);
});
