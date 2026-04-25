/**
 * Variant generator: source markdown + platform + tactics → ready-to-insert variant.
 *
 * Responsibilities:
 *   - Orchestrate prompt build + LLM call + JSON parse with defensive fallback.
 *   - Provide a `stub` path when ARK_API_KEY is unset so the rest of the pipeline
 *     (persistence, compliance review, UI) stays testable without network.
 *   - Never throw for recoverable LLM glitches — return `{ ok: false, reason }` so
 *     the worker can persist a failure state instead of crashing the job.
 */

import type { GeoTacticId, VariantPlatform } from '@geo/shared';
import { chat, isAvailable, type ChatResult } from '../llm/doubao';
import { buildVariantPrompt, type PromptContext } from './prompt-builder';

export type GeneratedVariant = {
  title: string;
  body: string;
  tactics_applied: GeoTacticId[];
  notes: string;
  /** 'doubao' when Ark answered, 'stub' when ARK_API_KEY unset. */
  provider: 'doubao' | 'stub';
  llm_raw?: unknown;
  usage?: ChatResult['usage'];
};

export type GenerateInput = {
  source_markdown: string;
  platform: VariantPlatform;
  tactics: GeoTacticId[];
  brand_name?: string;
  industry?: string;
  topic_hints?: string[];
  /** Max tokens for this generation. Default 2500 — enough for 1500字 with headroom. */
  max_tokens?: number;
};

export type GenerateResult =
  | { ok: true; variant: GeneratedVariant }
  | { ok: false; reason: string; provider: 'doubao' | 'stub' };

export async function generateVariant(input: GenerateInput): Promise<GenerateResult> {
  if (!isAvailable()) {
    return { ok: true, variant: buildStubVariant(input) };
  }

  const ctx: PromptContext = {
    source_markdown: input.source_markdown,
    platform: input.platform,
    tactics: input.tactics,
    brand_name: input.brand_name,
    industry: input.industry,
    topic_hints: input.topic_hints,
  };
  const messages = buildVariantPrompt(ctx);

  try {
    const result = await chat({
      messages,
      temperature: 0.7,
      max_tokens: input.max_tokens ?? 2500,
      response_format: 'json_object',
      // 180s: Seed 1.8 on a 1500-char Chinese rewrite + JSON wrap lands 90-130s.
      // Don't push lower — timeouts here burn tokens with no output.
      timeout_ms: 180_000,
    });

    const parsed = parseResponse(result.content);
    if (!parsed) {
      return {
        ok: false,
        reason: `LLM returned unparseable JSON (${result.content.slice(0, 120)}…)`,
        provider: 'doubao',
      };
    }

    return {
      ok: true,
      variant: {
        title: parsed.title,
        body: parsed.body,
        tactics_applied: filterValidTactics(parsed.tactics_applied, input.tactics),
        notes: parsed.notes,
        provider: 'doubao',
        llm_raw: result.raw,
        usage: result.usage,
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      provider: 'doubao',
    };
  }
}

function parseResponse(
  text: string,
): { title: string; body: string; tactics_applied: string[]; notes: string } | null {
  // Some models wrap JSON in ```json fences despite response_format; strip if present.
  const cleaned = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    if (typeof obj.title !== 'string' || typeof obj.body !== 'string') return null;
    return {
      title: obj.title,
      body: obj.body,
      tactics_applied: Array.isArray(obj.tactics_applied)
        ? (obj.tactics_applied as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
      notes: typeof obj.notes === 'string' ? obj.notes : '',
    };
  } catch {
    return null;
  }
}

function filterValidTactics(reported: string[], allowed: GeoTacticId[]): GeoTacticId[] {
  const set = new Set(allowed);
  return reported.filter((x): x is GeoTacticId => set.has(x as GeoTacticId));
}

/**
 * Offline stub used when ARK_API_KEY is unset.
 * Returns a clearly-labelled placeholder so downstream UI can render + compliance
 * can run + E2E tests can pass without network. Real work begins when the key is set.
 */
function buildStubVariant(input: GenerateInput): GeneratedVariant {
  const preview = input.source_markdown.slice(0, 180).replace(/\s+/g, ' ');
  const title = `[STUB] 基于源文的 ${input.platform} 变体`;
  const body =
    `> 本变体由 stub 生成 — ARK_API_KEY 尚未配置。填入豆包 key 后内容会由真实 LLM 产出。\n\n` +
    `【源文摘要】${preview}${input.source_markdown.length > 180 ? '…' : ''}\n\n` +
    `【占位正文】在真实 API 下,将按 ${input.tactics.join(' + ')} 组合重写为 800-1500 字的 ${input.platform} 内容,` +
    `含权威引语、量化统计、标注来源、流畅长段落。`;
  return {
    title,
    body,
    tactics_applied: input.tactics,
    notes: 'stub response — set ARK_API_KEY to enable real generation',
    provider: 'stub',
  };
}
