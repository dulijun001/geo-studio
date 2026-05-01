/**
 * Per-tenant aggregated input that all artifact generators consume.
 *
 * Worker job (apps/worker/src/jobs/discoverability-regenerate.ts) is
 * responsible for building this from raw DB rows AND applying D16's
 * double gate (geo_visible=true + testimonials compliance='approved'
 * + staff status='active'). The generators trust the input — they do
 * NOT re-filter.
 *
 * Why one input shape: each artifact reads roughly the same data; passing
 * it once and letting generators pick what they need makes regeneration
 * one DB round-trip per tenant, not four.
 */

import type {
  ArticleProfile,
  BrandProfile,
  FaqProfile,
  PhysicianProfile,
  ServiceProfile,
  TestimonialProfile,
} from './types';

export type ArtifactInput = {
  tenant_id: string;
  /** The slug used for public URL routing. */
  tenant_slug: string;
  /** Public base URL (e.g. https://geo.studio). Used by builders for canonical URLs. */
  public_base_url: string;
  /** When this regen ran. ISO string. */
  generated_at: string;

  brand: BrandProfile;
  physicians: PhysicianProfile[];
  services: ServiceProfile[];
  testimonials: TestimonialProfile[];
  faqs: FaqProfile[];
  articles: ArticleProfile[];
};
