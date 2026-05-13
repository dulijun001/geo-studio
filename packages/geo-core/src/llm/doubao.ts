/**
 * Volcengine Ark (Doubao) chat completion client.
 *
 * Ark exposes an OpenAI-compatible /chat/completions endpoint — we use plain
 * fetch so we don't pull in the whole openai SDK (and its Node-only deps).
 *
 * Contract:
 *   - `chat()` returns the assistant text, throws on network / upstream error.
 *   - Caller decides retry / fallback / parsing.
 *   - When ARK_API_KEY is unset, caller should NOT invoke this — use `isAvailable()`
 *     to branch before calling. We fail loudly instead of silently stubbing here
 *     so mis-config doesn't look like model degradation.
 */

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatOptions = {
  messages: ChatMessage[];
  /** Defaults to `doubao-seed-1-6-pro-250815` via ARK_MODEL_PRO. */
  model?: string;
  temperature?: number;
  max_tokens?: number;
  /** Deterministic JSON mode hint — Ark accepts {type:'json_object'} like OpenAI. */
  response_format?: 'text' | 'json_object';
  /** Wall-clock timeout in ms. Default 30s. */
  timeout_ms?: number;
};

export type ChatResult = {
  content: string;
  model: string;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  raw: unknown;
};

export function isAvailable(): boolean {
  return !!process.env.ARK_API_KEY;
}

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  const apiKey = process.env.ARK_API_KEY;
  const baseUrl = process.env.ARK_BASE_URL ?? 'https://ark.cn-beijing.volces.com/api/v3';
  const model = opts.model ?? process.env.ARK_MODEL_PRO ?? 'doubao-seed-1-6-pro-250815';
  if (!apiKey) throw new Error('ARK_API_KEY not set — check isAvailable() before calling chat()');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeout_ms ?? 30_000);

  try {
    const wantsJson = opts.response_format === 'json_object';
    const callOnce = async (includeResponseFormat: boolean): Promise<Response> => {
      const body: Record<string, unknown> = {
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.7,
      };
      if (opts.max_tokens) body.max_tokens = opts.max_tokens;
      if (includeResponseFormat && wantsJson) {
        body.response_format = { type: 'json_object' };
      }
      return fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    };

    let res = await callOnce(true);
    // Some Ark endpoints (notably thinking / deepseek-r1 variants) reject
    // response_format. Auto-retry once without it + nudge the model in the
    // last system message to emit pure JSON. Caller's downstream JSON parser
    // already tolerates ```json fences (see ai-draft-core repairJsonStringEscapes).
    if (!res.ok && wantsJson && res.status === 400) {
      const text = await res.text().catch(() => '');
      if (/response_format/i.test(text)) {
        // Append a JSON-only nudge as a final system message before retry.
        const nudged = [...opts.messages];
        nudged.push({
          role: 'system',
          content:
            '严格只输出一个合法 JSON 对象 — 不要 markdown 代码栅栏 / 不要前后任何说明文字 / 不要思考过程 / 不要双引号外的中文双引号 "" 包内嵌引用。',
        });
        const fallbackBody: Record<string, unknown> = {
          model,
          messages: nudged,
          temperature: opts.temperature ?? 0.7,
        };
        if (opts.max_tokens) fallbackBody.max_tokens = opts.max_tokens;
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(fallbackBody),
          signal: controller.signal,
        });
      } else {
        // Different 400 — restore the error to surface up
        throw new Error(`Ark ${res.status}: ${text.slice(0, 300)}`);
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ark ${res.status}: ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage?: ChatResult['usage'];
    };
    const content = json.choices?.[0]?.message?.content ?? '';
    return {
      content,
      model: json.model,
      usage: json.usage ?? {},
      raw: json,
    };
  } finally {
    clearTimeout(timeout);
  }
}
