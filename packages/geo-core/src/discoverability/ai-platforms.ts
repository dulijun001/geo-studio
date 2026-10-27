/**
 * AI 平台与引擎全景元数据
 * 来源于 GEOInflow (liekan) 官方核心资产，包含国内外主流 AI 搜索、LLM 对话引擎及对应厂商信息。
 */

export interface AIPlatformMeta {
  id: string;
  name: string;
  operator: string;
  website: string;
  region: 'domestic' | 'global';
  crawlers?: string[];
  docUrls?: string[];
}

export const AI_PLATFORMS: Record<string, AIPlatformMeta> = {
  // === 国内主力引擎 (重点覆盖) ===
  doubao: {
    id: 'doubao',
    name: '豆包',
    operator: '字节跳动 (Bytedance)',
    website: 'https://www.doubao.com',
    region: 'domestic',
    crawlers: ['Bytespider'],
    docUrls: ['https://www.doubao.com'],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek (深度求索)',
    operator: '杭州深度求索',
    website: 'https://www.deepseek.com',
    region: 'domestic',
    crawlers: ['DeepSeekBot'],
    docUrls: ['https://www.deepseek.com'],
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi (月之暗面)',
    operator: 'Moonshot AI',
    website: 'https://kimi.moonshot.cn',
    region: 'domestic',
    crawlers: ['KimiBot', 'MoonshotBot'],
    docUrls: ['https://kimi.moonshot.cn'],
  },
  yuanbao: {
    id: 'yuanbao',
    name: '腾讯元宝',
    operator: '腾讯 (Tencent)',
    website: 'https://yuanbao.tencent.com',
    region: 'domestic',
    crawlers: ['HunyuanBot', 'HySpider'],
    docUrls: ['https://yuanbao.tencent.com'],
  },
  baidu_wenxin: {
    id: 'baidu_wenxin',
    name: '百度文心一言 / 百度AI',
    operator: '百度 (Baidu)',
    website: 'https://yiyan.baidu.com',
    region: 'domestic',
    crawlers: ['Baiduspider', 'Baiduspider-render'],
    docUrls: ['https://www.baidu.com/search/spider.html'],
  },
  tongyi: {
    id: 'tongyi',
    name: '通义千问',
    operator: '阿里巴巴 (Alibaba)',
    website: 'https://tongyi.aliyun.com',
    region: 'domestic',
    crawlers: ['AliyunBot'],
    docUrls: ['https://tongyi.aliyun.com'],
  },
  metaso: {
    id: 'metaso',
    name: '秘塔 AI 搜索',
    operator: '秘塔科技 (Metaso)',
    website: 'https://metaso.cn',
    region: 'domestic',
    crawlers: ['MetasoSpider'],
    docUrls: ['https://metaso.cn'],
  },
  zhipu: {
    id: 'zhipu',
    name: '智谱清言',
    operator: '智谱 AI (Zhipu)',
    website: 'https://chatglm.cn',
    region: 'domestic',
    crawlers: ['ChatGLMBot'],
    docUrls: ['https://chatglm.cn'],
  },

  // === 海外主力引擎 (备用参考) ===
  chatgpt: {
    id: 'chatgpt',
    name: 'ChatGPT / SearchGPT',
    operator: 'OpenAI',
    website: 'https://chatgpt.com',
    region: 'global',
    crawlers: ['OAI-SearchBot', 'GPTBot', 'ChatGPT-User'],
    docUrls: ['https://platform.openai.com/docs/bots'],
  },
  claude: {
    id: 'claude',
    name: 'Claude',
    operator: 'Anthropic',
    website: 'https://claude.ai',
    region: 'global',
    crawlers: ['ClaudeBot', 'Claude-Web'],
    docUrls: ['https://claudebot.anthropic.com'],
  },
  perplexity: {
    id: 'perplexity',
    name: 'Perplexity AI',
    operator: 'Perplexity',
    website: 'https://www.perplexity.ai',
    region: 'global',
    crawlers: ['PerplexityBot'],
    docUrls: ['https://docs.perplexity.ai/guides/model-cards'],
  },
};

/**
 * 快速检查某个平台是否在支持矩阵中
 */
export function getAIPlatform(id: string): AIPlatformMeta | undefined {
  return AI_PLATFORMS[id.toLowerCase()];
}

/**
 * 获取所有国内核心模型清单
 */
export function getDomesticPlatforms(): AIPlatformMeta[] {
  return Object.values(AI_PLATFORMS).filter((p) => p.region === 'domestic');
}
