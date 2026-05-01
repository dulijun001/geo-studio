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
