/**
 * 选题池自动补货 (V1.13, D52) — nightly-draft 选题前的水位检查 + D31 自动展开。
 *
 * 动机:产线全自动链条里唯一断点是"出题"。选题池耗尽 → 凌晨 cron 空转失败
 * (2026-07-13 实发)。本模块在选题前探水位,不足时从「主题题」(category='theme')
 * 自动展开补充。
 *
 * 四道入库闸(顺序执行,任一不过即弃):
 *   1. 地域锚定 — 无 昆明/西山/双塔/希望路 的子问题直接弃(D44:无地域题 0 引用)
 *   2. 竞品名 grep — brand_vocab.competitor + aliases 硬匹配(D32,广告法 §13)
 *   3. 语义查重 — isNearDuplicateQuestion 双规则(D24:换皮旧题 = spam 降权)
 *   4. 红线词 — 绝对化/疗效承诺等出现在题面即弃(题面是后续起草的 seed)
 *
 * 失败哲学:补货失败**不阻塞**当晚起草(池里可能还有存货),但必须 reportError
 * 出声(D49:系统性失败零静默)。
 */
import { expandSubtopics, isNearDuplicateQuestion, type QuestionLike } from '@geo/geo-core';
import { reportError, reportEvent } from '@geo/shared';
import type { getServiceClient } from './supabase';

type Client = ReturnType<typeof getServiceClient>;

const GEO_ANCHOR_RE = /昆明|西山|双塔|希望路/;
/** 区县/商圈级地域词 — 与 0043/0046 RPC 的 geo_tier 判定正则保持一致 */
const DISTRICT_RE = /西山区|五华区|盘龙区|官渡区|呈贡区|安宁|东川|晋宁|富民|宜良|石林|嵩明|禄劝|寻甸/;
/**
 * D55 地域分级 priority(0046 起 RPC 排序纯 priority 驱动,此处不赋值 = 分级失效)。
 * 原先硬编码 priority=9 会盖过 0046 给区县级定的 7,补货几晚就把分级冲垮
 * —— 正是 0043 注释预言的"手动调的 priority 会被新题入库覆盖"。
 */
function geoTieredPriority(text: string): number {
  if (DISTRICT_RE.test(text)) return 7; // A 区县/商圈级 — 长尾补充
  if (text.includes('昆明')) return 10; // B 城市级 — 优先起草带
  return 4; // C 无地域 — RPC 已过滤,压低仅为语义一致
}
/** 题面级红线(种子污染防线,比 D33 词库窄:只拦绝对不该出现在"问题"里的) */
const SEED_REDLINE_RE = /最好|最佳|第一名|排名第一|根治|治愈|无痛|保证|包治/;
/** 每晚最多展开的主题数(成本上限 ≈ 3 次 LLM 调用) */
const MAX_THEMES_PER_NIGHT = 3;
const SUBTOPICS_PER_THEME = 10;

export type ReplenishOutcome = {
  probed: number;
  deficit: number;
  inserted: number;
  skipped: { no_geo: number; competitor: number; duplicate: number; redline: number };
};

export async function replenishTopicPool(
  client: Client,
  tenantId: string,
  topicCountAuto: number,
): Promise<ReplenishOutcome> {
  const outcome: ReplenishOutcome = {
    probed: 0,
    deficit: 0,
    inserted: 0,
    skipped: { no_geo: 0, competitor: 0, duplicate: 0, redline: 0 },
  };

  // ── 1. 水位探针:复用选题 RPC(只读),看今晚够不够 ──
  const { data: probe, error: probeErr } = await client.rpc('daily_ops_pick_topics', {
    p_tenant_id: tenantId,
    p_limit: topicCountAuto,
    p_exclude_days: 7,
  });
  if (probeErr) {
    reportError(probeErr, { scope: 'daily-ops.replenish.probe', tenant_id: tenantId });
    return outcome;
  }
  outcome.probed = (probe ?? []).length;
  outcome.deficit = Math.max(0, topicCountAuto - outcome.probed);
  if (outcome.deficit === 0) return outcome;

  // ── 2. 展开素材:主题题(category='theme'),最久未展开优先 ──
  const { data: themes } = await client
    .from('questions')
    .select('id, text')
    .eq('tenant_id', tenantId)
    .eq('category', 'theme')
    .is('deleted_at', null)
    .order('updated_at', { ascending: true })
    .limit(MAX_THEMES_PER_NIGHT);
  if (!themes || themes.length === 0) {
    reportError(new Error('topic pool low but no theme questions (category=theme) to expand'), {
      scope: 'daily-ops.replenish.no_themes',
      tenant_id: tenantId,
    });
    return outcome;
  }

  // ── 3. 一次性装弹:存量题库(查重用)/ 竞品词典 / 品牌名 ──
  const { data: existingRows } = await client
    .from('questions')
    .select('text, intent')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);
  const existing: QuestionLike[] = ((existingRows ?? []) as QuestionLike[]).slice();

  const { data: compRows } = await client
    .from('brand_vocab')
    .select('term, aliases')
    .eq('tenant_id', tenantId)
    .eq('term_type', 'competitor')
    .is('deleted_at', null);
  const competitorNames: string[] = [];
  for (const r of (compRows ?? []) as Array<{ term: string; aliases: string[] | null }>) {
    competitorNames.push(r.term);
    if (Array.isArray(r.aliases)) competitorNames.push(...r.aliases);
  }

  const { data: brandRow } = await client
    .from('brands')
    .select('name, id')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();
  const brandName = (brandRow?.name as string | undefined) ?? undefined;
  const brandId = (brandRow?.id as string | undefined) ?? null;

  // ── 4. 逐主题展开,四道闸过滤后入库 ──
  for (const theme of themes) {
    if (outcome.inserted >= outcome.deficit) break;
    const topic = (theme.text as string).replace(/[((]主题[))]\s*$/, '').trim();

    const result = await expandSubtopics({
      topic,
      industry_context: '昆明本地口腔医疗(民营口腔门诊部,位于西山区希望路锦粼天序,昆明双塔旁)',
      brand_name: brandName,
      count: SUBTOPICS_PER_THEME,
    });
    // 无论成败都 touch updated_at,让轮转前进(失败主题不永久占位)
    await client
      .from('questions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', theme.id);

    if (!result.ok) {
      reportError(new Error(`expandSubtopics failed: ${result.reason}`), {
        scope: 'daily-ops.replenish.expand',
        tenant_id: tenantId,
        extra: { theme: topic },
      });
      continue;
    }

    for (const s of result.subtopics) {
      if (outcome.inserted >= outcome.deficit) break;
      // 闸1:地域锚定
      if (!GEO_ANCHOR_RE.test(s.text)) {
        outcome.skipped.no_geo++;
        continue;
      }
      // 闸2:竞品名(D32)
      if (competitorNames.some((n) => n.length > 1 && s.text.includes(n))) {
        outcome.skipped.competitor++;
        continue;
      }
      // 闸3:语义查重(D24)
      const verdict = isNearDuplicateQuestion({ text: s.text, intent: s.intent }, existing);
      if (verdict.duplicate) {
        outcome.skipped.duplicate++;
        continue;
      }
      // 闸4:题面红线
      if (SEED_REDLINE_RE.test(s.text)) {
        outcome.skipped.redline++;
        continue;
      }

      const { error: insErr } = await client.from('questions').insert({
        tenant_id: tenantId,
        brand_id: brandId,
        text: s.text,
        intent: s.intent,
        city: '昆明',
        priority: geoTieredPriority(s.text),
        active: true,
        parent_id: theme.id,
        subtopic_source: 'llm_expand',
      });
      if (insErr) {
        reportError(insErr, { scope: 'daily-ops.replenish.insert', tenant_id: tenantId });
        continue;
      }
      existing.push({ text: s.text, intent: s.intent }); // 同批内也查重
      outcome.inserted++;
    }
  }

  reportEvent('daily-ops.replenish.done', {
    scope: 'daily-ops.replenish',
    tenant_id: tenantId,
    extra: outcome as unknown as Record<string, unknown>,
  });
  console.log(
    `[topic-replenish] tenant=${tenantId} probed=${outcome.probed} deficit=${outcome.deficit} ` +
      `inserted=${outcome.inserted} skipped=${JSON.stringify(outcome.skipped)}`,
  );
  return outcome;
}
