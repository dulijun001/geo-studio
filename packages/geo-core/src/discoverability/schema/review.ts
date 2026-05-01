/**
 * TestimonialProfile → schema.org/Review JSON-LD.
 *
 * Author always rendered as Person with the pseudonym. Never expose real
 * patient identity.
 *
 * itemReviewed: prefer the Service if service_id is set; otherwise the brand.
 * Both expressed as @id refs (resolved at consumer-side).
 */

import type { TestimonialProfile } from '../types';
import { clean } from './clean';
import type { JsonLd } from './types';

export function buildReviewSchema(profile: TestimonialProfile): JsonLd {
  const itemReviewed = profile.service_id
    ? {
        '@type': 'MedicalProcedure',
        '@id': profile.url
          .replace(/\/testimonials\/[^/]+$/, '')
          .concat(`/services/${profile.service_id}`),
      }
    : {
        '@type': 'MedicalBusiness',
        '@id': profile.url.replace(/\/testimonials\/[^/]+$/, ''),
      };

  return clean({
    '@context': 'https://schema.org',
    '@type': 'Review',
    '@id': profile.url,
    author: {
      '@type': 'Person',
      name: profile.author,
    },
    reviewBody: profile.body,
    reviewRating:
      profile.rating !== undefined
        ? {
            '@type': 'Rating',
            ratingValue: profile.rating,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
    datePublished: profile.attested_at.split('T')[0], // ISO date only
    itemReviewed,
  });
}
