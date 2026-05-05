/**
 * Build a BrandProfile from a brands row + tenant context.
 *
 * D18: drop fields with no values. Empty arrays / empty strings / null →
 * undefined in the resulting profile so downstream schema generators don't
 * emit empty Schema properties.
 */

import type { BrandProfile, Credential, GeoAddress, BusinessHours } from '../types';

type BrandRow = {
  id: string;
  tenant_id: string;
  name: string;
  location: Record<string, unknown> | null;
  /** Optional for backward-compat with mocks/older rows; resolves to [] when missing. */
  service_areas?: string[] | null;
  contact_phones: string[];
  medical_specialties: string[];
  business_hours: Record<string, unknown> | null;
  website_url: string | null;
  social_urls: Record<string, unknown> | null;
  description_md: string | null;
  verified_credentials: Record<string, unknown> | null;
  updated_at: Date | string;
};

type BuildBrandOpts = {
  /** Public canonical URL. Falls back to `${publicBaseUrl}/c/${tenantSlug}` if website_url is null. */
  publicBaseUrl: string;
  tenantSlug: string;
};

export function buildBrandProfile(row: BrandRow, opts: BuildBrandOpts): BrandProfile {
  const url =
    typeof row.website_url === 'string' && row.website_url.length > 0
      ? row.website_url
      : `${opts.publicBaseUrl}/c/${opts.tenantSlug}`;

  // Dedup + trim service_areas. Operators can paste sloppy values and we
  // don't want "昆明 " ≠ "昆明" causing duplicate areaServed entries.
  const cleanedAreas = (row.service_areas ?? [])
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
  const areaServed = Array.from(new Set(cleanedAreas));

  return {
    kind: 'brand',
    id: row.id,
    tenant_id: row.tenant_id,
    url,
    name: row.name,
    description: emptyToUndef(row.description_md),
    medical_specialties: row.medical_specialties ?? [],
    address: locationToAddress(row.location),
    area_served: areaServed,
    business_hours: businessHoursClean(row.business_hours),
    contact_phones: row.contact_phones ?? [],
    website_url: emptyToUndef(row.website_url),
    social_urls: socialUrlsClean(row.social_urls),
    credentials: flattenCredentials(row.verified_credentials),
    updated_at: toIsoString(row.updated_at),
  };
}

function emptyToUndef(s: string | null | undefined): string | undefined {
  if (typeof s !== 'string') return undefined;
  const t = s.trim();
  return t.length === 0 ? undefined : t;
}

function locationToAddress(loc: Record<string, unknown> | null): GeoAddress | undefined {
  if (!loc || Object.keys(loc).length === 0) return undefined;
  const a: GeoAddress = {};
  if (typeof loc.address === 'string' && loc.address) a.street = loc.address;
  if (typeof loc.neighborhood === 'string' && loc.neighborhood) a.neighborhood = loc.neighborhood;
  if (typeof loc.district === 'string' && loc.district) a.district = loc.district;
  if (typeof loc.city === 'string' && loc.city) a.city = loc.city;
  if (typeof loc.region === 'string' && loc.region) a.region = loc.region;
  if (typeof loc.postal_code === 'string' && loc.postal_code) a.postal_code = loc.postal_code;
  if (typeof loc.country === 'string' && loc.country) a.country = loc.country;
  if (typeof loc.lat === 'number') a.latitude = loc.lat;
  if (typeof loc.lng === 'number') a.longitude = loc.lng;
  return Object.keys(a).length === 0 ? undefined : a;
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function businessHoursClean(bh: Record<string, unknown> | null): BusinessHours | undefined {
  if (!bh) return undefined;
  const out: BusinessHours = {};
  for (const d of DAYS) {
    const v = bh[d];
    if (typeof v === 'string' && /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(v)) out[d] = v;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

function socialUrlsClean(s: Record<string, unknown> | null): Record<string, string> | undefined {
  if (!s) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(s)) {
    if (typeof v === 'string' && v.length > 0) out[k] = v;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

function flattenCredentials(vc: Record<string, unknown> | null): Credential[] {
  if (!vc) return [];
  const out: Credential[] = [];
  const licenses = Array.isArray(vc.licenses) ? vc.licenses : [];
  const accreditations = Array.isArray(vc.accreditations) ? vc.accreditations : [];
  for (const c of [...licenses, ...accreditations]) {
    if (typeof c !== 'object' || c === null) continue;
    const obj = c as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name : undefined;
    if (!name) continue;
    out.push({
      name,
      issuer: typeof obj.issuer === 'string' ? obj.issuer : undefined,
      number: typeof obj.number === 'string' ? obj.number : undefined,
      valid_until: typeof obj.valid_until === 'string' ? obj.valid_until : undefined,
    });
  }
  return out;
}

function toIsoString(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}
