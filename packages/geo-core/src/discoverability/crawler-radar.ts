/**
 * AI 爬虫与 AI 搜索引擎指纹台账与识别模块
 * 
 * 融合并吸纳了 GEOInflow (liekan) 沉淀的核心爬虫指纹与国内 AI 引擎规则：
 * 1. 国内主流 AI 引擎/爬虫：字节跳动 Bytespider / 豆包、百度 Baiduspider / 文心一言、月之暗面 Kimi、腾讯混元、阿里通义、Minimax 等；
 * 2. 国际主流：OpenAI (GPTBot / ChatGPT-User), Anthropic (ClaudeBot), Perplexity 等；
 * 3. 爬虫目的分类：ai_training (训练离线), ai_search (实时索引/搜索), ai_user (用户会话触发), traditional_search, other;
 * 4. 官方 IP CIDR 范围校验 (Anti-Spoofing 防伪造)；
 * 5. 浏览器端 AI 搜索引擎 Referrer 识别 (区分人类传统搜索 vs AI 引荐会话).
 */

export type CrawlerPurpose =
  | 'ai_training'
  | 'ai_search'
  | 'ai_user'
  | 'traditional_search'
  | 'other';

export type CrawlerPlatform =
  | 'bytedance'
  | 'baidu'
  | 'kimi'
  | 'tencent'
  | 'alibaba'
  | 'minimax'
  | 'openai'
  | 'anthropic'
  | 'perplexity'
  | 'google'
  | 'microsoft'
  | 'apple'
  | 'other';

export interface CrawlerIdentity {
  id: string;
  name: string;
  platform: CrawlerPlatform;
  vendor: string;
  purpose: CrawlerPurpose;
  uaRegex: RegExp;
  robotsToken: string;
  officialIpPrefixes?: string[];
  isDomestic: boolean;
}

/**
 * 核心 AI 与主流爬虫注册清单 (国内优先)
 */
export const CRAWLER_REGISTRY: CrawlerIdentity[] = [
  // --- 字节跳动 (ByteDance / 豆包) ---
  {
    id: 'bytespider',
    name: 'Bytespider',
    platform: 'bytedance',
    vendor: '字节跳动',
    purpose: 'ai_training',
    uaRegex: /Bytespider/i,
    robotsToken: 'Bytespider',
    isDomestic: true,
  },
  // --- 百度 (Baidu / 文心一言) ---
  {
    id: 'baiduspider',
    name: 'Baiduspider',
    platform: 'baidu',
    vendor: '百度',
    purpose: 'traditional_search',
    uaRegex: /Baiduspider/i,
    robotsToken: 'Baiduspider',
    isDomestic: true,
  },
  {
    id: 'baiduspider-render',
    name: 'Baiduspider-render',
    platform: 'baidu',
    vendor: '百度',
    purpose: 'traditional_search',
    uaRegex: /Baiduspider-render/i,
    robotsToken: 'Baiduspider-render',
    isDomestic: true,
  },
  // --- 月之暗面 (Moonshot / Kimi) ---
  {
    id: 'kimibot',
    name: 'KimiBot',
    platform: 'kimi',
    vendor: '月之暗面',
    purpose: 'ai_training',
    uaRegex: /KimiBot/i,
    robotsToken: 'KimiBot',
    officialIpPrefixes: ['47.79.225.241/32', '47.79.230.254/32', '47.79.253.42/32', '47.79.253.91/32'],
    isDomestic: true,
  },
  {
    id: 'kimi-searchbot',
    name: 'Kimi-SearchBot',
    platform: 'kimi',
    vendor: '月之暗面',
    purpose: 'ai_search',
    uaRegex: /Kimi-SearchBot/i,
    robotsToken: 'Kimi-SearchBot',
    officialIpPrefixes: ['47.79.225.241/32', '47.79.230.254/32', '47.79.253.42/32', '47.79.253.91/32'],
    isDomestic: true,
  },
  {
    id: 'kimi-user',
    name: 'Kimi-User',
    platform: 'kimi',
    vendor: '月之暗面',
    purpose: 'ai_user',
    uaRegex: /Kimi-User/i,
    robotsToken: 'Kimi-User',
    officialIpPrefixes: ['47.79.225.241/32', '47.79.230.254/32', '47.79.253.42/32', '47.79.253.91/32'],
    isDomestic: true,
  },
  // --- 腾讯 (Tencent / 混元 / 元宝) ---
  {
    id: 'hyspider',
    name: 'HySpider',
    platform: 'tencent',
    vendor: '腾讯混元',
    purpose: 'ai_training',
    uaRegex: /HySpider/i,
    robotsToken: 'HySpider',
    officialIpPrefixes: ['43.144.87.0/24', '43.144.88.0/24'],
    isDomestic: true,
  },
  // --- 阿里巴巴 (Alibaba / 通义千问) ---
  {
    id: 'qwen-spider',
    name: 'QwenSpider',
    platform: 'alibaba',
    vendor: '阿里云/通义',
    purpose: 'ai_search',
    uaRegex: /(QwenSpider|AliyunBot)/i,
    robotsToken: 'QwenSpider',
    isDomestic: true,
  },
  // --- OpenAI ---
  {
    id: 'gptbot',
    name: 'GPTBot',
    platform: 'openai',
    vendor: 'OpenAI',
    purpose: 'ai_training',
    uaRegex: /GPTBot/i,
    robotsToken: 'GPTBot',
    officialIpPrefixes: [
      '20.171.206.0/24', '20.171.207.0/24', '52.230.152.0/24',
      '4.227.36.0/25', '74.7.175.128/25', '74.7.227.0/25'
    ],
    isDomestic: false,
  },
  {
    id: 'oai-searchbot',
    name: 'OAI-SearchBot',
    platform: 'openai',
    vendor: 'OpenAI',
    purpose: 'ai_search',
    uaRegex: /OAI-SearchBot/i,
    robotsToken: 'OAI-SearchBot',
    isDomestic: false,
  },
  {
    id: 'chatgpt-user',
    name: 'ChatGPT-User',
    platform: 'openai',
    vendor: 'OpenAI',
    purpose: 'ai_user',
    uaRegex: /ChatGPT-User/i,
    robotsToken: 'ChatGPT-User',
    isDomestic: false,
  },
  // --- Anthropic ---
  {
    id: 'claudebot',
    name: 'ClaudeBot',
    platform: 'anthropic',
    vendor: 'Anthropic',
    purpose: 'ai_training',
    uaRegex: /ClaudeBot/i,
    robotsToken: 'ClaudeBot',
    isDomestic: false,
  },
  {
    id: 'claude-searchbot',
    name: 'Claude-SearchBot',
    platform: 'anthropic',
    vendor: 'Anthropic',
    purpose: 'ai_search',
    uaRegex: /Claude-SearchBot/i,
    robotsToken: 'Claude-SearchBot',
    isDomestic: false,
  },
  // --- Perplexity ---
  {
    id: 'perplexitybot',
    name: 'PerplexityBot',
    platform: 'perplexity',
    vendor: 'Perplexity',
    purpose: 'ai_search',
    uaRegex: /PerplexityBot/i,
    robotsToken: 'PerplexityBot',
    isDomestic: false,
  },
  // --- 传统搜索爬虫 (对比与兜底) ---
  {
    id: 'googlebot',
    name: 'Googlebot',
    platform: 'google',
    vendor: 'Google',
    purpose: 'traditional_search',
    uaRegex: /Googlebot/i,
    robotsToken: 'Googlebot',
    isDomestic: false,
  },
  {
    id: 'bingbot',
    name: 'bingbot',
    platform: 'microsoft',
    vendor: 'Microsoft',
    purpose: 'traditional_search',
    uaRegex: /bingbot/i,
    robotsToken: 'bingbot',
    isDomestic: false,
  },
];

/**
 * 识别请求中的爬虫身份
 */
export function identifyCrawler(userAgent: string | null | undefined): CrawlerIdentity | null {
  if (!userAgent || typeof userAgent !== 'string') return null;
  for (const crawler of CRAWLER_REGISTRY) {
    if (crawler.uaRegex.test(userAgent)) {
      return crawler;
    }
  }
  return null;
}

/**
 * 简易 IPv4 CIDR 包含判断
 */
function ipToNumber(ip: string): number {
  return ip
    .split('.')
    .reduce((acc, octet) => ((acc << 8) + Number.parseInt(octet, 10)) >>> 0, 0);
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  if (!ip || !cidr) return false;
  const [rangeIp, prefixLengthStr] = cidr.split('/');
  if (!rangeIp || !prefixLengthStr) return false;

  const prefixLength = Number.parseInt(prefixLengthStr, 10);
  if (Number.isNaN(prefixLength) || prefixLength < 0 || prefixLength > 32) return false;

  try {
    const ipNum = ipToNumber(ip);
    const rangeNum = ipToNumber(rangeIp);
    const mask = prefixLength === 0 ? 0 : (~0 << (32 - prefixLength)) >>> 0;
    return (ipNum & mask) === (rangeNum & mask);
  } catch {
    return false;
  }
}

/**
 * 验证爬虫 IP 是否符合官方白名单 (防伪造)
 */
export function verifyCrawlerIp(crawler: CrawlerIdentity, clientIp: string): {
  verified: boolean;
  status: 'verified' | 'unverified' | 'no_baseline';
} {
  if (!crawler.officialIpPrefixes || crawler.officialIpPrefixes.length === 0) {
    return { verified: false, status: 'no_baseline' };
  }
  const match = crawler.officialIpPrefixes.some(cidr => isIpInCidr(clientIp, cidr));
  return {
    verified: match,
    status: match ? 'verified' : 'unverified',
  };
}

/**
 * AI 搜索引擎 Referrer 识别台账 (区分传统搜索 vs AI 引荐)
 */
export interface AiReferrerSource {
  platform: string;
  name: string;
  domainMatches: string[];
  type: 'ai_search' | 'traditional_search';
  isDomestic: boolean;
}

export const AI_REFERRER_SOURCES: AiReferrerSource[] = [
  // 国内 AI 引擎
  {
    platform: 'doubao',
    name: '豆包',
    domainMatches: ['doubao.com', 'volces.com'],
    type: 'ai_search',
    isDomestic: true,
  },
  {
    platform: 'kimi',
    name: 'Kimi 智能助手',
    domainMatches: ['kimi.moonshot.cn', 'kimi.ai'],
    type: 'ai_search',
    isDomestic: true,
  },
  {
    platform: 'yuanbao',
    name: '腾讯元宝',
    domainMatches: ['yuanbao.tencent.com'],
    type: 'ai_search',
    isDomestic: true,
  },
  {
    platform: 'metaso',
    name: '秘塔 AI 搜索',
    domainMatches: ['metaso.cn'],
    type: 'ai_search',
    isDomestic: true,
  },
  {
    platform: 'deepseek',
    name: 'DeepSeek',
    domainMatches: ['chat.deepseek.com', 'deepseek.com'],
    type: 'ai_search',
    isDomestic: true,
  },
  {
    platform: 'quark',
    name: '夸克 AI',
    domainMatches: ['quark.cn', 'myquark.cn'],
    type: 'ai_search',
    isDomestic: true,
  },
  {
    platform: 'baidu_ai',
    name: '文心一言 / 百度 AI',
    domainMatches: ['yiyan.baidu.com', 'chat.baidu.com'],
    type: 'ai_search',
    isDomestic: true,
  },
  // 国际 AI 引擎
  {
    platform: 'chatgpt',
    name: 'ChatGPT',
    domainMatches: ['chatgpt.com', 'chat.openai.com'],
    type: 'ai_search',
    isDomestic: false,
  },
  {
    platform: 'perplexity',
    name: 'Perplexity',
    domainMatches: ['perplexity.ai'],
    type: 'ai_search',
    isDomestic: false,
  },
  {
    platform: 'claude',
    name: 'Claude',
    domainMatches: ['claude.ai'],
    type: 'ai_search',
    isDomestic: false,
  },
  // 传统搜索引擎
  {
    platform: 'baidu',
    name: '百度搜索',
    domainMatches: ['baidu.com'],
    type: 'traditional_search',
    isDomestic: true,
  },
  {
    platform: 'google',
    name: 'Google 搜索',
    domainMatches: ['google.com'],
    type: 'traditional_search',
    isDomestic: false,
  },
];

/**
 * 根据 Referrer URL 分析是否为 AI 搜索引荐来源
 */
export function identifyReferrer(referrerUrl: string | null | undefined): AiReferrerSource | null {
  if (!referrerUrl) return null;
  try {
    const url = new URL(referrerUrl);
    const hostname = url.hostname.toLowerCase();
    for (const source of AI_REFERRER_SOURCES) {
      if (source.domainMatches.some(domain => hostname === domain || hostname.endsWith(`.${domain}`))) {
        return source;
      }
    }
  } catch {
    // 兼容可能传入纯 domain 的情况
    const lower = referrerUrl.toLowerCase();
    for (const source of AI_REFERRER_SOURCES) {
      if (source.domainMatches.some(domain => lower.includes(domain))) {
        return source;
      }
    }
  }
  return null;
}
