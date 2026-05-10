/**
 * Questions library — CRUD + batch import + AI dig (V1.9-2).
 *
 * Why this page exists:
 *   - The batch-draft flow in /content/batch reads from `questions` table.
 *   - Until now the table could only be populated via a one-shot seed CLI.
 *   - With 30 staff × 3 platforms = 30 tasks/day, you burn ~10 questions
 *     daily, so the admin must be able to add new questions in the UI.
 *
 * AI dig: LLM (FAST model) suggests 15-20 candidate questions based on
 * tenant.industry + (optional) category narrowing. Operator reviews and
 * bulk-inserts the ones they want. Mirrors the citations/discover pattern.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { chat, isAvailable as llmAvailable } from '@geo/geo-core';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { requireRole } from '@/lib/tenant';
import {
  QUESTION_INTENTS,
  type DiscoveredQuestion,
  type QuestionInput,
  type QuestionIntent,
} from './types';

const MAX_TEXT = 200;
const MAX_CITY = 40;
const MAX_CATEGORY = 40;

function normalize(input: QuestionInput) {
  const text = input.text.trim();
  if (!text) throw new Error('问题文本不能为空');
  if (text.length > MAX_TEXT) throw new Error(`问题过长(>${MAX_TEXT} 字)`);

  const intent =
    input.intent && (QUESTION_INTENTS as readonly string[]).includes(input.intent)
      ? input.intent
      : null;

  const city = input.city?.trim().slice(0, MAX_CITY) || null;
  const category = input.category?.trim().slice(0, MAX_CATEGORY) || null;

  let priority = input.priority ?? 5;
  if (typeof priority !== 'number' || Number.isNaN(priority)) priority = 5;
  priority = Math.max(0, Math.min(10, Math.round(priority)));

  const active = input.active ?? true;

  return { text, intent, city, category, priority, active };
}

export async function createQuestion(tenantSlug: string, input: QuestionInput): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const fields = normalize(input);
  const service = getSupabaseServiceClient();

  // Dedup: same tenant + same text (case-insensitive) → reject
  const { data: existing } = await service
    .from('questions')
    .select('id, text')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null);
  const lower = fields.text.toLowerCase();
  if ((existing ?? []).some((r) => (r.text as string).toLowerCase().trim() === lower)) {
    throw new Error('已有完全一样的问题');
  }

  const { error } = await service.from('questions').insert({
    tenant_id: tenant.id,
    ...fields,
  });
  if (error) throw new Error(`新增失败: ${error.message}`);
  revalidatePath(`/t/${tenantSlug}/questions`);
}

export async function updateQuestion(
  tenantSlug: string,
  id: string,
  input: QuestionInput,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const fields = normalize(input);
  const service = getSupabaseServiceClient();

  const { error } = await service
    .from('questions')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`更新失败: ${error.message}`);
  revalidatePath(`/t/${tenantSlug}/questions`);
}

export async function toggleQuestionActive(
  tenantSlug: string,
  id: string,
  active: boolean,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();

  const { error } = await service
    .from('questions')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`状态切换失败: ${error.message}`);
  revalidatePath(`/t/${tenantSlug}/questions`);
}

export async function deleteQuestion(tenantSlug: string, id: string): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();

  // Soft-delete; the question may be referenced by historical
  // draft_batch_items.question_id (which uses ON DELETE SET NULL).
  const { error } = await service
    .from('questions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`删除失败: ${error.message}`);
  revalidatePath(`/t/${tenantSlug}/questions`);
}

const MAX_BATCH_PASTE = 100;

export async function batchPasteQuestions(
  tenantSlug: string,
  raw: string,
  shared: { intent?: QuestionIntent | null; city?: string | null; category?: string | null; priority?: number },
): Promise<{ inserted: number; skipped: string[] }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.length <= MAX_TEXT);
  if (lines.length === 0) throw new Error('粘贴内容里没有有效问题');
  if (lines.length > MAX_BATCH_PASTE) {
    throw new Error(`一次最多 ${MAX_BATCH_PASTE} 条,你这次有 ${lines.length} 条`);
  }

  // Dedup against existing
  const { data: existing } = await service
    .from('questions')
    .select('text')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null);
  const existingSet = new Set(
    ((existing ?? []) as Array<{ text: string }>).map((r) => r.text.toLowerCase().trim()),
  );

  const seenInBatch = new Set<string>();
  const toInsert: Array<Record<string, unknown>> = [];
  const skipped: string[] = [];

  const sharedFields = {
    intent:
      shared.intent && (QUESTION_INTENTS as readonly string[]).includes(shared.intent)
        ? shared.intent
        : null,
    city: shared.city?.trim().slice(0, MAX_CITY) || null,
    category: shared.category?.trim().slice(0, MAX_CATEGORY) || null,
    priority: Math.max(0, Math.min(10, Math.round(shared.priority ?? 5))),
  };

  for (const text of lines) {
    const lower = text.toLowerCase();
    if (existingSet.has(lower) || seenInBatch.has(lower)) {
      skipped.push(text);
      continue;
    }
    seenInBatch.add(lower);
    toInsert.push({
      tenant_id: tenant.id,
      text,
      ...sharedFields,
      active: true,
    });
  }

  let inserted = 0;
  if (toInsert.length > 0) {
    const { error } = await service.from('questions').insert(toInsert);
    if (error) throw new Error(`批量入库失败: ${error.message}`);
    inserted = toInsert.length;
  }
  revalidatePath(`/t/${tenantSlug}/questions`);
  return { inserted, skipped };
}

// =====================================================================
// AI dig
// =====================================================================

const MAX_DISCOVER = 20;

const DIG_SYSTEM_PROMPT = `你是 GEO(生成式引擎优化)选题策划师。基于行业 + 已有问题清单的 gap,推荐用户在豆包/元宝/夸克等 AI 搜索里**真实会问**的问题。

## 硬约束

1. **真实搜索意图**:用户在 AI 搜索里会怎么问就怎么写,口语 + 第一人称(如"种植牙怕疼怎么办"),不要写成标题党
2. **避开重复**:已有问题清单会传给你,不要推荐同义/同题
3. **覆盖 6 类意图**(请严格使用以下英文 enum 值):
   - local_recommendation:本地推荐("昆明 XX 哪家好","附近的 XX")
   - price_inquiry:价格("XX 多少钱","集采价")
   - doctor_review:品牌/医生评价("XX 怎么样","XX 靠谱吗")
   - procedure_info:流程操作("怎么挑医生","术前要做什么","流程是怎样的")
   - risk_concern:风险担忧("XX 有副作用吗","XX 之后多久恢复","XX 危险吗")
   - comparison:对比("XX 和 YY 哪个好","进口 vs 国产")
4. **priority 0-10**:常被搜的高频核心问题 = 8-10;长尾偏门 = 3-5

## 输出格式(严格 JSON)

{
  "questions": [
    {
      "text": "种植牙怕疼怎么办",
      "intent": "risk_concern",
      "category": "种植",
      "priority": 9,
      "rationale": "高频疑虑型 query,豆包 SOV 数据里这类占引流 35%+"
    },
    ...
  ]
}`;

export async function discoverQuestions(
  tenantSlug: string,
  input: { category?: string },
): Promise<{ questions: DiscoveredQuestion[] }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  if (!llmAvailable()) {
    throw new Error('LLM 不可用(ARK_API_KEY 未配置)');
  }
  const service = getSupabaseServiceClient();

  // Pull existing questions text so the LLM can avoid duplicates
  const { data: existing } = await service
    .from('questions')
    .select('text')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .limit(200);
  const existingTexts = ((existing ?? []) as Array<{ text: string }>).map((r) => r.text);

  const userPrompt =
    `# 行业\n${tenant.industry}\n\n` +
    (input.category?.trim()
      ? `# 限定品类\n${input.category.trim()}\n\n`
      : '') +
    `# 已有问题(已入库 ${existingTexts.length} 条,避开同义/重复)\n` +
    existingTexts.slice(0, 60).map((t, i) => `${i + 1}. ${t}`).join('\n') +
    (existingTexts.length > 60 ? `\n…(共 ${existingTexts.length} 条,只列前 60)` : '') +
    `\n\n# 任务\n推荐 ${MAX_DISCOVER} 个**新**问题,覆盖 6 类意图各几条,priority 按搜索热度。`;

  let result;
  try {
    result = await chat({
      messages: [
        { role: 'system', content: DIG_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      model: process.env.ARK_MODEL_FAST,
      temperature: 0.4,
      max_tokens: 3000,
      response_format: 'json_object',
      timeout_ms: 90_000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort|timeout/i.test(msg)) throw new Error('豆包响应超过 90 秒,稍后重试');
    throw new Error(`豆包调用失败: ${msg.slice(0, 150)}`);
  }

  let parsed: { questions?: DiscoveredQuestion[] };
  try {
    parsed = JSON.parse(result.content) as { questions?: DiscoveredQuestion[] };
  } catch {
    throw new Error('豆包返回格式异常,请重试');
  }
  const questions = (parsed.questions ?? [])
    .filter((q): q is DiscoveredQuestion => Boolean(q?.text))
    .slice(0, MAX_DISCOVER);
  if (questions.length === 0) throw new Error('豆包没推荐出问题,换品类或重试');
  return { questions };
}

export async function bulkInsertDiscoveredQuestions(
  tenantSlug: string,
  questions: DiscoveredQuestion[],
): Promise<{ inserted: number; skipped: string[] }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  if (!questions.length) throw new Error('请至少选 1 条');
  if (questions.length > MAX_DISCOVER) throw new Error(`一次最多 ${MAX_DISCOVER} 条`);
  const service = getSupabaseServiceClient();

  const { data: existing } = await service
    .from('questions')
    .select('text')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null);
  const existingSet = new Set(
    ((existing ?? []) as Array<{ text: string }>).map((r) => r.text.toLowerCase().trim()),
  );

  const skipped: string[] = [];
  const toInsert: Array<Record<string, unknown>> = [];
  for (const q of questions) {
    const text = q.text.trim();
    if (!text) continue;
    if (existingSet.has(text.toLowerCase())) {
      skipped.push(text);
      continue;
    }
    toInsert.push({
      tenant_id: tenant.id,
      text: text.slice(0, MAX_TEXT),
      intent: (QUESTION_INTENTS as readonly string[]).includes(q.intent) ? q.intent : null,
      category: q.category?.trim().slice(0, MAX_CATEGORY) || null,
      priority: Math.max(0, Math.min(10, Math.round(q.priority ?? 5))),
      active: true,
    });
  }

  let inserted = 0;
  if (toInsert.length > 0) {
    const { error } = await service.from('questions').insert(toInsert);
    if (error) throw new Error(`入库失败: ${error.message}`);
    inserted = toInsert.length;
  }
  revalidatePath(`/t/${tenantSlug}/questions`);
  return { inserted, skipped };
}
