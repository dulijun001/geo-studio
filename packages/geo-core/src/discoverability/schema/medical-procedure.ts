/**
 * ServiceProfile → schema.org/MedicalProcedure JSON-LD.
 *
 * Type selection:
 *   - procedure_code present → MedicalProcedure (medical-specific)
 *   - otherwise              → Service (non-medical fallback)
 *
 * Pricing emitted as PriceSpecification when range info exists.
 */

import type { ServiceProfile } from '../types';
import { clean } from './clean';
import type { JsonLd } from './types';

export function buildMedicalProcedureSchema(profile: ServiceProfile): JsonLd {
  const type = profile.procedure_code ? 'MedicalProcedure' : 'Service';

  return clean({
    '@context': 'https://schema.org',
    '@type': type,
    '@id': profile.url,
    name: profile.name,
    description: profile.description,
    url: profile.url,
    category: profile.category,
    code: profile.procedure_code
      ? {
          '@type': 'MedicalCode',
          codeValue: profile.procedure_code,
          codingSystem: profile.procedure_code.startsWith('http')
            ? 'SNOMED'
            : 'internal',
        }
      : undefined,
    offers: profile.price_range
      ? {
          '@type': 'AggregateOffer',
          lowPrice: profile.price_range.min,
          highPrice: profile.price_range.max,
          priceCurrency: profile.price_range.currency ?? 'CNY',
        }
      : undefined,
    // duration in ISO 8601 format
    estimatedDuration:
      profile.duration_minutes !== undefined
        ? `PT${profile.duration_minutes}M`
        : undefined,
    provider: { '@id': brandUrlFromServiceUrl(profile.url) },
  });
}

function brandUrlFromServiceUrl(url: string): string {
  return url.replace(/\/services\/[^/]+$/, '');
}
