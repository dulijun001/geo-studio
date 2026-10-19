/**
 * 轻量全网长尾词与竞品搜索雷达 Job (Design 4 / Milestone 3)
 * 
 * 核心逻辑:
 * 1. 替代重量级真机 (CloakBrowser) 做大范围长尾词初筛 (极低成本: 5元/1000次)
 * 2. 批量并发调用 DeepSeek Search API (利用 rerank_score, authority 权威度打分)
 * 3. 实时分析:
 *    - 权威度高的竞品截流页面 (authority >= 3)
 *    - 松鼠口腔本品牌的自然收录与曝光
 *    - 发现重要异常/机会时，自动向 pg-boss 发起定向真机快照验证 (geo.snapshot) 或企业微信预警
 */

import type PgBoss from 'pg-boss';
import { defaultDeepSeekTools } from '@geo/geo-core';
import { getServiceClient } from '../lib/supabase';
import { notifyWeCom } from '../lib/wecom';

export interface GeoLightRadarJob {
  tenant_slug?: string;
  limit_questions?: number;
  min_authority_trigger?: number; // 默认 3
}

export interface RadarItemAnalysis {
  question_id: string;
  question_text: string;
  total_hits: number;
  highest_authority: number;
  brand_hits: number;
  competitor_hits: number;
  top_sources: string[];
  needs_real_browser_verify: boolean;
}

export async function handleGeoLightRadar(
  boss: PgBoss,
  data: GeoLightRadarJob = {},
): Promise<{ scanned: number; high_value_count: number; findings: RadarItemAnalysis[] }> {
  if (!defaultDeepSeekTools.isConfigured()) {
    console.warn('[light-radar] DEEPSEEK_API_KEY 未配置，跳过轻量雷达扫描');
    return { scanned: 0, high_value_count: 0, findings: [] };
  }

  const supabase = getServiceClient();
  const limit = data.limit_questions || 30;
  const authorityThreshold = data.min_authority_trigger || 3;

  // 1. 获取目标租户与品牌词表
  const tenantSlug = data.tenant_slug || 'songshu';
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, slug, name')
    .eq('slug', tenantSlug)
    .single();

  if (!tenant) {
    console.error(`[light-radar] Tenant ${tenantSlug} not found`);
    return { scanned: 0, high_value_count: 0, findings: [] };
  }

  // 2. 加载该租户品牌词与竞品词
  const { data: vocabList } = await supabase
    .from('brand_vocab')
    .select('term, term_type')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true);

  const brandTerms = (vocabList || [])
    .filter((v: any) => v.term_type === 'brand')
    .map((v: any) => v.term);
  const competitorTerms = (vocabList || [])
    .filter((v: any) => v.term_type === 'competitor')
    .map((v: any) => v.term);

  // 3. 读取待巡检的长尾题目池
  const { data: questions } = await supabase
    .from('questions')
    .select('id, question, priority')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .limit(limit);

  if (!questions || questions.length === 0) {
    console.log('[light-radar] 没有活跃题目待扫描');
    return { scanned: 0, high_value_count: 0, findings: [] };
  }

  console.log(`[light-radar] 开始轻量搜索雷达扫描，共 ${questions.length} 道长尾词...`);
  const findings: RadarItemAnalysis[] = [];
  let highValueCount = 0;

  for (const q of questions) {
    try {
      // 调 DeepSeek Search 原生 API
      const searchRes = await defaultDeepSeekTools.search(q.question, 8);
      const results = searchRes.results || [];

      let maxAuthority = 0;
      let brandCount = 0;
      let competitorCount = 0;
      const sources: string[] = [];

      for (const item of results) {
        const auth = item.authority || 0;
        if (auth > maxAuthority) maxAuthority = auth;
        if (item.source && !sources.includes(item.source)) {
          sources.push(item.source);
        }

        const textBlob = `${item.title} ${item.snippet}`;
        // 统计品牌词提及
        for (const b of brandTerms) {
          if (textBlob.includes(b)) {
            brandCount++;
            break;
          }
        }
        // 统计竞品词提及
        for (const c of competitorTerms) {
          if (textBlob.includes(c)) {
            competitorCount++;
            break;
          }
        }
      }

      // 判断是否触发真机深度校验 (发现高权重收录或者高频竞品占位)
      const needsVerify = maxAuthority >= authorityThreshold && (brandCount > 0 || competitorCount > 0);
      if (needsVerify) {
        highValueCount++;
      }

      findings.push({
        question_id: q.id,
        question_text: q.question,
        total_hits: results.length,
        highest_authority: maxAuthority,
        brand_hits: brandCount,
        competitor_hits: competitorCount,
        top_sources: sources.slice(0, 3),
        needs_real_browser_verify: needsVerify,
      });

      // 如果发现了高权重价值信号，自动将题目加入当天的真机快照队列 (geo.snapshot)
      if (needsVerify && boss) {
        await boss.send('geo.snapshot', {
          tenant_id: tenant.id,
          question_id: q.id,
          engine: 'doubao',
          trigger_reason: 'light_radar_high_authority_opportunity',
        });
      }
    } catch (err: any) {
      console.warn(`[light-radar] 词条 "${q.question}" 扫描失败: ${err.message}`);
    }
  }

  // 4. 汇总告警至企微 (如果有高价值发现)
  if (highValueCount > 0) {
    const summary =
      `• 扫描词数: **${questions.length}**\n` +
      `• 发现高权威/竞品异动词: **${highValueCount}** 道\n` +
      `• 触发真机验证任务: 已自动入队\n` +
      `> 建议关注高权威引用页面，抢占 Stage 1 候选池。`;
    await notifyWeCom(`🛰️ GEO 轻量搜索雷达巡检报告 (${tenantSlug})`, summary);
  }

  return {
    scanned: questions.length,
    high_value_count: highValueCount,
    findings,
  };
}
