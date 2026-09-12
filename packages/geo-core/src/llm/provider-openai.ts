/**
 * 通用 OpenAI-兼容 chat provider — 用作火山方舟(Ark)的备用通道。
 *
 * 为什么需要它:2026 年 4-8 月火山方舟共欠费停摆 5 次(见 CLAUDE.md D49)。
 * 原架构下 `packages/geo-core/src/llm/` 只有 Ark 一条线,欠费 = 内容生成
 * 完全停摆且不可绕过。本 provider 让任何 OpenAI 兼容端点(官方 OpenAI、
 * DeepSeek、通义、本机 new-api 网关、任意中转)都能顶上。
 *
 * 刻意做成「通用 OpenAI 兼容」而不是绑定某一家:
 *   - Ark 本身就是 OpenAI 兼容格式,两条通道请求体几乎一致,维护成本最低
 *   - 换供应商只改 env,不改代码 —— 下次某家出问题不必再动工程
 *
 * 配置(全部可选;未配则备用通道视为不可用,行为与改造前完全一致):
 *   LLM_FALLBACK_API_KEY   备用通道 key
 *   LLM_FALLBACK_BASE_URL  备用通道 base url,需含 /v1 之类前缀,不含 /chat/completions
 *   LLM_FALLBACK_MODEL     备用通道默认模型名
 *   LLM_FALLBACK_MODEL_FAST 备用通道快模型(短结构化任务用,见 D54);缺省回落到上一项
 */

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { ChatOptions, ChatResult } from './provider-ark';

/** 最小响应封装,只保留下面用到的 ok / status / text() / json()。 */
type SimpleResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

/**
 * 用 node:http 代替全局 fetch 发 POST。
 *
 * 原因(2026-09-11 实测):Node 内置 fetch(undici)写死 headersTimeout=300s ——
 * 服务端 300s 内不回响应头就抛 "fetch failed",且 fetch 参数改不了。备用通道
 * (claudeproxy → claude CLI)一次真实起草实测 275-300s+,正好撞线。node:http 只受
 * 我们自己传入的 AbortSignal(= opts.timeout_ms)约束。
 */
function postJson(
  url: string,
  headers: Record<string, string>,
  body: string,
  signal: AbortSignal,
): Promise<SimpleResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const doRequest = u.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = doRequest(
      u,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
        signal,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('error', reject);
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            text: async () => text,
            json: async () => JSON.parse(text) as unknown,
          });
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const FALLBACK_MIN_TIMEOUT_MS = Number(process.env.LLM_FALLBACK_MIN_TIMEOUT_MS) || 240_000;

export function fallbackAvailable(): boolean {
  return !!process.env.LLM_FALLBACK_API_KEY && !!process.env.LLM_FALLBACK_BASE_URL;
}

/** 备用通道当前配置摘要 — 供早报/诊断打印,不含 key 本身。 */
export function fallbackDescribe(): string {
  if (!fallbackAvailable()) return '未配置';
  const url = process.env.LLM_FALLBACK_BASE_URL ?? '';
  const model = process.env.LLM_FALLBACK_MODEL ?? '(未指定模型)';
  return `${url} · ${model}`;
}

/**
 * Ark 的模型标识是 endpoint id(ep-xxx)或豆包专有名,在备用通道上一定无效。
 * 因此这里**忽略**调用方传入的 model,一律用备用通道自己的配置。
 * `fast` 语义靠 opts.model 是否等于 ARK_MODEL_FAST 来判断 —— 短任务(D54)
 * 走备用通道的快模型,避免用贵模型跑关键词挖掘这类小活。
 */
function resolveModel(opts: ChatOptions): string {
  const askedFast =
    !!opts.model && !!process.env.ARK_MODEL_FAST && opts.model === process.env.ARK_MODEL_FAST;
  if (askedFast && process.env.LLM_FALLBACK_MODEL_FAST) {
    return process.env.LLM_FALLBACK_MODEL_FAST;
  }
  return process.env.LLM_FALLBACK_MODEL ?? 'gpt-4o-mini';
}

export async function fallbackChat(opts: ChatOptions): Promise<ChatResult> {
  const apiKey = process.env.LLM_FALLBACK_API_KEY;
  const baseUrl = process.env.LLM_FALLBACK_BASE_URL;
  if (!apiKey || !baseUrl) {
    throw new Error(
      'LLM fallback not configured — check fallbackAvailable() before calling fallbackChat()',
    );
  }

  const model = resolveModel(opts);
  const controller = new AbortController();
  // 备用通道是 CLI 包装的慢通道(单次 45s 起步,长文 300s+),调用方按 Ark 定的 30-60s
  // 超时在这里一律不够用 —— 给一个地板值,取调用方超时与地板的较大者。
  // 2026-09-11 实测:不加地板时 variant-generate(60s)/合规复审(默认 30s)在备用通道全部 abort。
  const timeoutMs = Math.max(opts.timeout_ms ?? 30_000, FALLBACK_MIN_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const wantsJson = opts.response_format === 'json_object';
    const body: Record<string, unknown> = {
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
    };
    if (opts.max_tokens) body.max_tokens = opts.max_tokens;
    if (wantsJson) body.response_format = { type: 'json_object' };

    const call = (payload: Record<string, unknown>) =>
      postJson(
        `${baseUrl.replace(/\/$/, '')}/chat/completions`,
        { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        JSON.stringify(payload),
        controller.signal,
      );

    let res = await call(body);

    // 与 Ark 侧同样的兜底:部分端点(推理模型/中转)拒收 response_format,
    // 去掉它并在末尾追加纯 JSON 指令重试一次。下游解析器已容忍 ``` 栅栏。
    if (!res.ok && wantsJson && res.status === 400) {
      const text = await res.text().catch(() => '');
      if (/response_format/i.test(text)) {
        const nudged = [...opts.messages];
        nudged.push({
          role: 'system',
          content:
            '严格只输出一个合法 JSON 对象 — 不要 markdown 代码栅栏 / 不要前后任何说明文字 / 不要思考过程。',
        });
        const retry: Record<string, unknown> = {
          model,
          messages: nudged,
          temperature: opts.temperature ?? 0.7,
        };
        if (opts.max_tokens) retry.max_tokens = opts.max_tokens;
        res = await call(retry);
      } else {
        throw new Error(`Fallback ${res.status}: ${text.slice(0, 300)}`);
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // 前缀刻意用 "Fallback" 而非 "Ark" — 让 D49 的系统性失败正则和 Sentry
      // 能一眼区分「主通道挂了」和「连备用通道也挂了」。
      throw new Error(`Fallback ${res.status}: ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage?: ChatResult['usage'];
    };
    return {
      content: json.choices?.[0]?.message?.content ?? '',
      model: json.model ?? model,
      usage: json.usage ?? {},
      raw: json,
    };
  } finally {
    clearTimeout(timeout);
  }
}
