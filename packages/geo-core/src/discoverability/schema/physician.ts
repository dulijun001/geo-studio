/**
 * PhysicianProfile → schema.org/Physician JSON-LD.
 *
 * Physician is a sub-type of MedicalBusiness in schema.org's taxonomy, but
 * for individual doctors we use it directly. The brand's MedicalBusiness
 * entity references its physicians via memberOf in the AI Content Feed
 * (handled by feed builder, not this schema generator).
 */

import type { PhysicianProfile } from '../types';
import { clean } from './clean';
import type { JsonLd } from './types';

export function buildPhysicianSchema(profile: PhysicianProfile): JsonLd {
  return clean({
    '@context': 'https://schema.org',
    '@type': 'Physician',
    '@id': profile.url,
    name: profile.name,
    description: profile.description,
    url: profile.url,
    jobTitle: profile.role,
    medicalSpecialty: profile.specialties,
    hasCredential: [
      ...profile.board_certifications.map((cert) => ({
        '@type': 'EducationalOccupationalCredential',
        credentialCategory: 'professional certification',
        name: cert,
      })),
      ...profile.education.map((edu) => ({
        '@type': 'EducationalOccupationalCredential',
        credentialCategory: 'degree',
        name: edu.degree,
        recognizedBy: edu.school
          ? { '@type': 'EducationalOrganization', name: edu.school }
          : undefined,
        dateCreated: edu.year ? `${edu.year}` : undefined,
      })),
    ],
    // schema.org/identifier for license number
    identifier: profile.license_number
      ? {
          '@type': 'PropertyValue',
          propertyID: 'medicalLicense',
          value: profile.license_number,
        }
      : undefined,
    // experience_years has no direct schema property — encode as additionalProperty
    additionalProperty:
      profile.experience_years !== undefined
        ? [
            {
              '@type': 'PropertyValue',
              name: 'experienceYears',
              value: profile.experience_years,
            },
          ]
        : undefined,
    worksFor: { '@id': brandUrlFromPhysicianUrl(profile.url) },
  });
}

/** Derive brand URL from physician URL: strip /doctors/<id> suffix. */
function brandUrlFromPhysicianUrl(url: string): string {
  return url.replace(/\/doctors\/[^/]+$/, '');
}
