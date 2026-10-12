/**
 * 搜索引擎站长主动推送（Baidu & Shenma Push）
 *
 * 背景：
 *   - 2026 年在中文互联网，由于 IndexNow 在中国不可用，快速触发百度/UC神马蜘蛛抓取
 *     必须走百度搜索资源平台和神马站长平台的 API 推送。
 *   - 将文章 URL 在发布时主动推给搜索引擎，能将 AI 抓取周期从几周缩短到几小时。
 */

export type BaiduPushResult = {
  ok: boolean;
  remain?: number;
  success?: number;
  not_same_site?: string[];
  not_valid?: string[];
  error?: string;
};

export type ShenmaPushResult = {
  ok: boolean;
  returnCode?: number;
  errorMsg?: string;
  error?: string;
};

export type UnifiedPushSummary = {
  urls_count: number;
  baidu?: BaiduPushResult;
  shenma?: ShenmaPushResult;
};

/**
 * 百度搜索资源平台 链接主动推送
 * API 规范：POST http://data.zz.baidu.com/urls?site={site}&token={token}
 * Content-Type: text/plain，body 为换行符分隔的 URL 列表
 */
export async function pushUrlsToBaidu(options: {
  site: string;
  token: string;
  urls: string[];
  pushType?: 'common' | 'daily';
  timeoutMs?: number;
}): Promise<BaiduPushResult> {
  const { site, token, urls, pushType = 'common', timeoutMs = 15_000 } = options;
  const cleanUrls = Array.from(new Set(urls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u))));

  if (cleanUrls.length === 0) {
    return { ok: false, error: 'URL 列表为空或格式不合法' };
  }
  if (!site || !token) {
    return { ok: false, error: '缺少百度 site 或 token' };
  }

  const endpoint = pushType === 'daily'
    ? `http://data.zz.baidu.com/urls?site=${encodeURIComponent(site)}&token=${encodeURIComponent(token)}&type=daily`
    : `http://data.zz.baidu.com/urls?site=${encodeURIComponent(site)}&token=${encodeURIComponent(token)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'User-Agent': 'geo-studio-agent/1.0 (+http://data.zz.baidu.com)',
      },
      body: cleanUrls.join('\n'),
      signal: controller.signal,
    });

    const data = await res.json() as Record<string, unknown>;
    clearTimeout(timer);

    if (res.ok && typeof data.success === 'number') {
      return {
        ok: true,
        success: data.success,
        remain: typeof data.remain === 'number' ? data.remain : undefined,
        not_same_site: Array.isArray(data.not_same_site) ? (data.not_same_site as string[]) : undefined,
        not_valid: Array.isArray(data.not_valid) ? (data.not_valid as string[]) : undefined,
      };
    }

    const message = (data.message as string | undefined) || `HTTP ${res.status}`;
    return {
      ok: false,
      error: `百度推送接口返回错误: ${message}`,
      remain: typeof data.remain === 'number' ? data.remain : undefined,
      not_same_site: Array.isArray(data.not_same_site) ? (data.not_same_site as string[]) : undefined,
      not_valid: Array.isArray(data.not_valid) ? (data.not_valid as string[]) : undefined,
    };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `百度推送网络请求异常: ${msg}` };
  }
}

/**
 * 阿里神马搜索站长平台 推送（UC / 夸克默认移动搜索引擎）
 * API 规范：POST https://data.zhanzhang.sm.cn/push?username={username}&site={site}&resource_name=user_submit
 * Header: Authorization: {access_key}
 * Content-Type: text/plain，body 为换行符分隔的 URL 列表
 */
export async function pushUrlsToShenma(options: {
  site: string;
  username: string;
  accessKey: string;
  urls: string[];
  timeoutMs?: number;
}): Promise<ShenmaPushResult> {
  const { site, username, accessKey, urls, timeoutMs = 15_000 } = options;
  const cleanUrls = Array.from(new Set(urls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u))));

  if (cleanUrls.length === 0) {
    return { ok: false, error: 'URL 列表为空' };
  }
  if (!site || !username || !accessKey) {
    return { ok: false, error: '缺少神马 site / username / accessKey' };
  }

  const endpoint = `https://data.zhanzhang.sm.cn/push?username=${encodeURIComponent(username)}&site=${encodeURIComponent(site)}&resource_name=user_submit`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Authorization': accessKey,
        'User-Agent': 'geo-studio-agent/1.0 (+https://zhanzhang.sm.cn)',
      },
      body: cleanUrls.join('\n'),
      signal: controller.signal,
    });

    const data = await res.json() as Record<string, unknown>;
    clearTimeout(timer);

    const code = Number(data.returnCode ?? res.status);
    const ok = code === 200 || data.status === 200;

    return {
      ok,
      returnCode: code,
      errorMsg: (data.errorMsg as string | undefined) ?? (data.message as string | undefined),
      error: ok ? undefined : ((data.errorMsg as string | undefined) ?? `HTTP ${res.status}`),
    };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `神马推送网络请求异常: ${msg}` };
  }
}

/**
 * 统一多引擎推送调度器
 */
export async function dispatchSearchEnginePush(params: {
  urls: string[];
  baidu?: { site: string; token: string; pushType?: 'common' | 'daily' };
  shenma?: { site: string; username: string; accessKey: string };
}): Promise<UnifiedPushSummary> {
  const cleanUrls = Array.from(new Set(params.urls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u))));

  const summary: UnifiedPushSummary = {
    urls_count: cleanUrls.length,
  };

  if (cleanUrls.length === 0) {
    return summary;
  }

  const tasks: Promise<void>[] = [];

  if (params.baidu?.site && params.baidu.token) {
    tasks.push(
      pushUrlsToBaidu({
        site: params.baidu.site,
        token: params.baidu.token,
        urls: cleanUrls,
        pushType: params.baidu.pushType,
      }).then((res) => {
        summary.baidu = res;
      }),
    );
  }

  if (params.shenma?.site && params.shenma.username && params.shenma.accessKey) {
    tasks.push(
      pushUrlsToShenma({
        site: params.shenma.site,
        username: params.shenma.username,
        accessKey: params.shenma.accessKey,
        urls: cleanUrls,
      }).then((res) => {
        summary.shenma = res;
      }),
    );
  }

  await Promise.all(tasks);
  return summary;
}
