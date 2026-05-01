/**
 * ArticleProfile → schema.org/MedicalWebPage or Article JSON-LD.
 *
 * MedicalWebPage is preferred when the publisher (the brand) has medical
 * specialties. For non-medical brands fall back to Article. The brand context
 * is implied via @id reference (resolved at consumer-side from the Feed).
 */

import type { ArticleProfile } from '../types';
import { clean } from './clean';
import type { JsonLd } from './types';

export function buildArticleSchema(profile: ArticleProfile): JsonLd {
  return clean({
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    '@id': profile.url,
    headline: profile.headline,
    description: profile.summary,
    articleBody: profile.body,
    url: profile.url,
    datePublished: profile.published_at?.split('T')[0],
    dateModified: profile.updated_at.split('T')[0],
    author: profile.author_name
      ? {
          '@type': 'Physician',
          name: profile.author_name,
        }
      : undefined,
  });
}
