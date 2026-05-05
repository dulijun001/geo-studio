/**
 * GeoProfile — canonical shape for any "AI-discoverable entity".
 *
 * Why this exists: brands, doctors, services, testimonials, FAQs, and content
 * articles all need to feed into the same set of downstream artifacts
 * (Schema.org JSON-LD, llms.txt, AI Content Feed, sitemap). Rather than each
 * downstream consumer reaching into raw DB rows, every entity gets converted
 * into a uniform GeoProfile shape first. Schema/feed/llms generators consume
 * profiles, not rows. Adding a new entity type later = add a new `kind` +
 * builder, no consumer changes.
 *
 * Inspired by Laravel aigeo's HasGeoProfile trait, but expressed as a
 * discriminated union since we don't have Eloquent and TypeScript's discriminated
 * unions are stronger than runtime trait dispatch.
 *
 * D18: only emit fields that have real values. Empty strings, empty arrays,
 * undefined → drop. The schema generator is the choke point that enforces this.
 */

export type EntityKind =
  | 'brand'
  | 'physician'
  | 'service'
  | 'testimonial'
  | 'faq'
  | 'article';

/** Address: subset of schema.org/PostalAddress fields. */
export type GeoAddress = {
  street?: string;
  neighborhood?: string;
  district?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
};

/** Hours: schema.org/openingHoursSpecification flattened. */
export type BusinessHours = Partial<
  Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', string>
>;

export type PriceRange = {
  min?: number;
  max?: number;
  typical?: number;
  currency?: string; // ISO 4217, default 'CNY'
};

export type Credential = {
  name: string;
  issuer?: string;
  number?: string;
  valid_until?: string; // ISO date
};

export type Education = {
  degree: string;
  school?: string;
  year?: number;
};

// ──────────────────────────────────────────────────────────────────────────

export type BrandProfile = {
  kind: 'brand';
  id: string;
  tenant_id: string;
  /** Canonical URL on the public site (or our hosted subdomain). */
  url: string;
  name: string;
  description?: string;
  /** schema.org/medicalSpecialty values. */
  medical_specialties: string[];
  address?: GeoAddress;
  /**
   * Drainage scope: cities/regions/provinces this brand serves. Mapped to
   * schema.org/MedicalBusiness.areaServed for AI engine local-query matching.
   * Distinct from `address` (single physical clinic location). Empty array
   * means "no explicit drainage scope set".
   */
  area_served: string[];
  business_hours?: BusinessHours;
  contact_phones: string[];
  website_url?: string;
  social_urls?: Record<string, string>;
  /** licenses + accreditations flattened. */
  credentials: Credential[];
  updated_at: string;
};

export type PhysicianProfile = {
  kind: 'physician';
  id: string;
  tenant_id: string;
  brand_id: string;
  url: string;
  name: string;
  description?: string;
  role: string;
  specialties: string[];
  experience_years?: number;
  license_number?: string;
  board_certifications: string[];
  education: Education[];
  updated_at: string;
};

export type ServiceProfile = {
  kind: 'service';
  id: string;
  tenant_id: string;
  brand_id: string;
  url: string;
  name: string;
  description?: string;
  category?: string;
  duration_minutes?: number;
  price_range?: PriceRange;
  /** SNOMED CT or internal code. */
  procedure_code?: string;
  updated_at: string;
};

export type TestimonialProfile = {
  kind: 'testimonial';
  id: string;
  tenant_id: string;
  brand_id: string;
  service_id?: string;
  url: string;
  /** Always the pseudonym, never real name. */
  author: string;
  body: string;
  rating?: number;
  attested_at: string;
  updated_at: string;
};

export type FaqProfile = {
  kind: 'faq';
  id: string;
  tenant_id: string;
  brand_id?: string;
  url: string;
  question: string;
  answer: string;
  category?: string;
  updated_at: string;
};

export type ArticleProfile = {
  kind: 'article';
  id: string;
  tenant_id: string;
  url: string;
  headline: string;
  summary?: string;
  body: string;
  /** Author display name (doctor) — pulled from staff_accounts when available. */
  author_name?: string;
  /** ISO date. */
  published_at?: string;
  updated_at: string;
};

export type GeoProfile =
  | BrandProfile
  | PhysicianProfile
  | ServiceProfile
  | TestimonialProfile
  | FaqProfile
  | ArticleProfile;

/** Helper to narrow by kind. */
export function isProfileKind<K extends EntityKind>(
  profile: GeoProfile,
  kind: K,
): profile is Extract<GeoProfile, { kind: K }> {
  return profile.kind === kind;
}
