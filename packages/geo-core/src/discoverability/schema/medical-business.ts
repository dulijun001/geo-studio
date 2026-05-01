/**
 * BrandProfile → schema.org/MedicalBusiness JSON-LD.
 *
 * Type selection:
 *   - medical_specialties.length > 0  → MedicalBusiness
 *   - otherwise                       → Organization
 *
 * Cross-references emitted as @id pointers (no embedding) so the same entity
 * isn't duplicated across pages — the AI Content Feed has the full Organization
 * once and other pages refer to it.
 */

import type { BrandProfile } from '../types';
import { clean } from './clean';
import { DAY_NAMES, type JsonLd } from './types';

export function buildMedicalBusinessSchema(profile: BrandProfile): JsonLd {
  const isMedical = profile.medical_specialties.length > 0;
  const type = isMedical ? 'MedicalBusiness' : 'Organization';

  const schema: JsonLd = {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': profile.url,
    name: profile.name,
    description: profile.description,
    url: profile.url,
    telephone: profile.contact_phones.length > 0 ? profile.contact_phones[0] : undefined,
    address: profile.address
      ? clean({
          '@type': 'PostalAddress',
          streetAddress: profile.address.street,
          addressLocality: profile.address.city,
          addressRegion: profile.address.region,
          postalCode: profile.address.postal_code,
          addressCountry: profile.address.country ?? 'CN',
        })
      : undefined,
    geo:
      profile.address?.latitude !== undefined && profile.address?.longitude !== undefined
        ? {
            '@type': 'GeoCoordinates',
            latitude: profile.address.latitude,
            longitude: profile.address.longitude,
          }
        : undefined,
    medicalSpecialty: isMedical ? profile.medical_specialties : undefined,
    openingHoursSpecification: profile.business_hours
      ? buildHoursSpecs(profile.business_hours)
      : undefined,
    sameAs: profile.social_urls ? Object.values(profile.social_urls) : undefined,
    hasCredential: profile.credentials.map((c) =>
      clean({
        '@type': 'EducationalOccupationalCredential',
        name: c.name,
        recognizedBy: c.issuer,
        identifier: c.number,
        validUntil: c.valid_until,
      }),
    ),
  };

  return clean(schema);
}

function buildHoursSpecs(
  hours: Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', string>>,
): unknown[] {
  const specs: unknown[] = [];
  for (const [shortDay, range] of Object.entries(hours)) {
    if (!range) continue;
    const m = range.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
    if (!m) continue;
    const dayName = DAY_NAMES[shortDay];
    if (!dayName) continue;
    specs.push({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: dayName,
      opens: m[1],
      closes: m[2],
    });
  }
  return specs;
}
