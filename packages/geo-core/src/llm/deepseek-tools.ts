/**
 * DeepSeek 原生工具接口客户端 (Search & Fetch)
 * 
 * 官方端点:
 *   - Search: POST https://api.deepseek.com/v1/tools/search
 *   - Fetch:  POST https://api.deepseek.com/v1/tools/fetch
 * 
 * 定价: 5 元 / 1000 次 (极低成本)
 * 用途:
 *   1. 轻量全网长尾词与竞品雷达 (基于 Search API 的 rerank_score 与 authority)
 *   2. 医疗合规引用 Ground-Truth 自动化校验 (基于 Fetch API 获取权威网页 Markdown)
 */

export interface DeepSeekSearchItem {
  title: string;
  url: string;
  snippet: string;
  rerank_score?: number;
  authority?: number; // 权威度评级，通常 1-5
  published_at?: string;
  source?: string;
}

export interface DeepSeekSearchResponse {
  query: string;
  total?: number;
  results: DeepSeekSearchItem[];
}

export interface DeepSeekFetchResponse {
  url: string;
  title?: string;
  markdown: string;
  status: number;
}

export interface DeepSeekToolOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class DeepSeekToolClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultTimeoutMs: number;

  constructor(opts: DeepSeekToolOptions = {}) {
    this.apiKey = opts.apiKey || process.env.DEEPSEEK_API_KEY || '';
    this.baseUrl = (opts.baseUrl || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
    this.defaultTimeoutMs = opts.timeoutMs || 30000;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * 搜索网页
   * @param query 搜索关键词，如 "昆明 种植牙 价格"
   * @param limit 返回结果条数 (默认 10)
   */
  public async search(query: string, limit = 10, timeoutMs?: number): Promise<DeepSeekSearchResponse> {
    if (!this.isConfigured()) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }

    const endpoint = `${this.baseUrl}/v1/tools/search`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs || this.defaultTimeoutMs);

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`DeepSeek Search API error (${resp.status}): ${errText.slice(0, 300)}`);
      }

      const data = (await resp.json()) as any;
      // 标准化解析结构
      const results: DeepSeekSearchItem[] = (data.results || data.data || []).map((item: any) => ({
        title: item.title || '',
        url: item.url || item.link || '',
        snippet: item.snippet || item.summary || item.content || '',
        rerank_score: typeof item.rerank_score === 'number' ? item.rerank_score : item.score,
        authority: typeof item.authority === 'number' ? item.authority : item.authority_score,
        published_at: item.published_at || item.publish_time,
        source: item.source || item.site,
      }));

      return {
        query,
        total: data.total || results.length,
        results,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`DeepSeek Search request timed out after ${timeoutMs || this.defaultTimeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 抓取单个网页并提取 Markdown 文本
   * @param url 目标权威源网页链接
   */
  public async fetchMarkdown(url: string, timeoutMs?: number): Promise<DeepSeekFetchResponse> {
    if (!this.isConfigured()) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }

    const endpoint = `${this.baseUrl}/v1/tools/fetch`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs || this.defaultTimeoutMs);

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`DeepSeek Fetch API error (${resp.status}): ${errText.slice(0, 300)}`);
      }

      const data = (await resp.json()) as any;
      return {
        url,
        title: data.title || '',
        markdown: data.markdown || data.content || data.text || '',
        status: resp.status,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`DeepSeek Fetch request timed out after ${timeoutMs || this.defaultTimeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// 默认单例导出一份
export const defaultDeepSeekTools = new DeepSeekToolClient();
