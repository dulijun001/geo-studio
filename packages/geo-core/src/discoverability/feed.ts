/**
 * AI Content Feed generator.
 *
 * Output: serialized JSON, structured for LLM crawler consumption.
 * Each section uses the same shape as the corresponding Schema.org JSON-LD
 * (so an LLM that understands Schema.org understands this directly), but
 * grouped under a top-level container that gives the indexer everything for
 * one tenant in one fetch.
 *
 * Versioning: `version` field at root. Bump when shape changes. Consumers
 * should be tolerant of additional fields.
 */

import type { ArtifactInput } from './artifact-input';
import {
  buildArticleSchema,
  buildFaqPageSchema,
  buildMedicalBusinessSchema,
  buildMedicalProcedureSchema,
  buildPhysicianSchema,
  buildReviewSchema,
} from './schema';

export const AI_FEED_VERSION = '1.0';

export function generateContentFeed(input: ArtifactInput): string {
  const feed = {
    version: AI_FEED_VERSION,
    generator: 'GEO Studio',
    generated_at: input.generated_at,
    tenant_slug: input.tenant_slug,

    brand: buildMedicalBusinessSchema(input.brand),

    physicians: input.physicians.map((p) => buildPhysicianSchema(p)),

    services: input.services.map((s) => buildMedicalProcedureSchema(s)),

    testimonials: input.testimonials.map((t) => buildReviewSchema(t)),

    faqs: buildFaqPageSchema(input.faqs, {
      pageUrl: `${input.public_base_url}/c/${input.tenant_slug}/faqs`,
    }),

    articles: input.articles.map((a) => buildArticleSchema(a)),

    counts: {
      physicians: input.physicians.length,
      services: input.services.length,
      testimonials: input.testimonials.length,
      faqs: input.faqs.length,
      articles: input.articles.length,
    },
  };

  // Two-space pretty print so AI crawlers (and humans debugging) can read it.
  return `${JSON.stringify(feed, null, 2)}\n`;
}
