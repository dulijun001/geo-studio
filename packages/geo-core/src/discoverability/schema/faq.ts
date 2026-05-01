/**
 * FaqProfile[] → schema.org/FAQPage JSON-LD.
 *
 * FAQPage is collection-based: takes an array of FaqProfile, returns one
 * FAQPage with mainEntity = list of Question/Answer pairs. Don't call this
 * with a single FAQ — instead pass [singleFaq] and handle it.
 *
 * Per FAQ category support: AI engines understand the FAQPage as a single
 * unit, so categories are not modeled separately at this layer (they're a UI
 * grouping, not a Schema.org concept).
 */

import type { FaqProfile } from '../types';
import { clean } from './clean';
import type { JsonLd } from './types';

type BuildFaqOpts = {
  /** URL the FAQ page lives at. Used as @id of the FAQPage. */
  pageUrl: string;
};

export function buildFaqPageSchema(profiles: FaqProfile[], opts: BuildFaqOpts): JsonLd | null {
  if (profiles.length === 0) return null;

  return clean({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': opts.pageUrl,
    url: opts.pageUrl,
    mainEntity: profiles.map((f) => ({
      '@type': 'Question',
      '@id': f.url,
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.answer,
      },
    })),
  });
}
