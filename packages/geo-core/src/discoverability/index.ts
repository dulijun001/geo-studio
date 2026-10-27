/**
 * V1.7 Discoverability Layer — public exports.
 *
 * See docs/06-discoverability.md and ADR 005.
 */

export * from './types';
export * from './profile';
export * from './schema';
export * from './artifact-input';
export { generateLlmsTxt, generateLlmsTxtFull } from './llms-txt';
export { generateContentFeed, AI_FEED_VERSION } from './feed';
export { generateAiSitemap } from './sitemap';
export {
  runDiscoverabilityAudit,
  type AuditDimension,
  type AuditReport,
  type AuditContext,
} from './audit';
export {
  pushUrlsToBaidu,
  pushUrlsToShenma,
  dispatchSearchEnginePush,
  type BaiduPushResult,
  type ShenmaPushResult,
  type UnifiedPushSummary,
} from './search-push';
export {
  CRAWLER_REGISTRY,
  AI_REFERRER_SOURCES,
  identifyCrawler,
  verifyCrawlerIp,
  identifyReferrer,
  isIpInCidr,
  type CrawlerIdentity,
  type CrawlerPurpose,
  type CrawlerPlatform,
  type AiReferrerSource,
} from './crawler-radar';
export * from './ai-platforms';
export * from './geo-weight';

