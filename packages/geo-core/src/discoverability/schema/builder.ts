/**
 * Generic dispatcher: take any GeoProfile, return its primary JSON-LD shape.
 *
 * This is the single entry point that page handlers should use. The kind-by-
 * kind builders are exported for FAQ collection (multi-input) and Breadcrumb
 * (no profile) cases that don't fit the 1:1 dispatch shape.
 */

import type { GeoProfile } from '../types';
import { buildArticleSchema } from './article';
import { buildMedicalBusinessSchema } from './medical-business';
import { buildMedicalProcedureSchema } from './medical-procedure';
import { buildPhysicianSchema } from './physician';
import { buildReviewSchema } from './review';
import type { JsonLd } from './types';

export function buildSchemaForProfile(profile: GeoProfile): JsonLd {
  switch (profile.kind) {
    case 'brand':
      return buildMedicalBusinessSchema(profile);
    case 'physician':
      return buildPhysicianSchema(profile);
    case 'service':
      return buildMedicalProcedureSchema(profile);
    case 'testimonial':
      return buildReviewSchema(profile);
    case 'article':
      return buildArticleSchema(profile);
    case 'faq':
      // FAQ is collection-based; single-FAQ builder wraps a 1-item FAQPage.
      throw new Error(
        'buildSchemaForProfile: faq requires the collection-based buildFaqPageSchema. Pass profiles array.',
      );
    default:
      // Exhaustive check
      assertNever(profile);
  }
}

function assertNever(x: never): never {
  throw new Error(`buildSchemaForProfile: unhandled profile kind: ${JSON.stringify(x)}`);
}
