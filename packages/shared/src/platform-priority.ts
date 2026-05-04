/**
 * Platform priorities for Doubao GEO (V1's primary AI engine, per ADR-002).
 *
 * Doubao is operated by Volcengine / ByteDance. Its training data + retrieval
 * layer disproportionately surfaces content from ByteDance-owned platforms
 * (Douyin, Toutiao). Microsoft / Tencent / Baidu ecosystems index less
 * reliably. The customer's content team should pour effort into P0 first.
 *
 * V2: when we add Yuanbao/DeepSeek/Kimi adapters, this becomes a per-engine
 * map. For V1 we hard-code Doubao priorities everywhere.
 */
import type { VariantPlatform } from './enums';

export type PlatformPriorityTier = 'P0' | 'P1' | 'P2' | 'P3';

export type PlatformPriorityEntry = {
  tier: PlatformPriorityTier;
  emoji: string;
  label: string;
  /** Display name + short reason. Surfaced as a tooltip / inline help. */
  reason: string;
};

export const TIER_LABEL: Record<PlatformPriorityTier, string> = {
  P0: '必发',
  P1: '高',
  P2: '中',
  P3: '低',
};

export const TIER_COLOR: Record<PlatformPriorityTier, string> = {
  P0: 'bg-rose-100 text-rose-800',
  P1: 'bg-amber-100 text-amber-800',
  P2: 'bg-sky-100 text-sky-800',
  P3: 'bg-slate-100 text-slate-700',
};

const TIER_ORDER: Record<PlatformPriorityTier, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export const DOUBAO_PLATFORM_PRIORITY: Record<VariantPlatform, PlatformPriorityEntry> = {
  douyin_script: {
    tier: 'P0',
    emoji: '🔥',
    label: '抖音(视频脚本)',
    reason: '字节自家平台,豆包近 100% 索引;视频脚本用',
  },
  douyin_image_text: {
    tier: 'P0',
    emoji: '🔥',
    label: '抖音(图文)',
    reason: '字节自家平台,豆包近 100% 索引;图文笔记用',
  },
  toutiao_article: {
    tier: 'P0',
    emoji: '🔥',
    label: '头条号',
    reason: '字节自家资讯平台,豆包高权重收录',
  },
  wechat_mp: {
    tier: 'P1',
    emoji: '⭐',
    label: '公众号',
    reason: '微信内容,豆包/元宝信任度高,长文权威',
  },
  zhihu: {
    tier: 'P1',
    emoji: '⭐',
    label: '知乎',
    reason: '长文 + 权威引用,GEO 9 法天然适配',
  },
  xiaohongshu: {
    tier: 'P2',
    emoji: '◐',
    label: '小红书',
    reason: '年轻流量大,但豆包索引一般',
  },
  baijiahao: {
    tier: 'P3',
    emoji: '⚪',
    label: '百家号',
    reason: '百度系,豆包少索引;主要为 SEO 兜底',
  },
  souhu: {
    tier: 'P3',
    emoji: '⚪',
    label: '搜狐号',
    reason: '搜狐系,主要为 SEO 资产,豆包覆盖低',
  },
};

/** Sort an array of platforms with the highest-priority (P0) first. */
export function sortPlatformsByDoubao(
  platforms: readonly VariantPlatform[],
): VariantPlatform[] {
  return [...platforms].sort((a, b) => {
    const ta = TIER_ORDER[DOUBAO_PLATFORM_PRIORITY[a].tier];
    const tb = TIER_ORDER[DOUBAO_PLATFORM_PRIORITY[b].tier];
    if (ta !== tb) return ta - tb;
    return a.localeCompare(b);
  });
}
