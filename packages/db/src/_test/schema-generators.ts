/**
 * Smoke test for V1.7 Schema.org JSON-LD generators.
 *
 * Pure-function tests (no DB). Run: pnpm db:test-schema
 *
 * Validates:
 *   1. Each generator emits the right @type
 *   2. D18: empty / null fields are dropped (clean enforced)
 *   3. Cross-references use @id pointers (no embedding duplication)
 *   4. Specific schema.org conventions: PT{n}M duration, ISO date, etc.
 */

import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  buildFaqPageSchema,
  buildMedicalBusinessSchema,
  buildMedicalProcedureSchema,
  buildPhysicianSchema,
  buildReviewSchema,
  buildSchemaForProfile,
  buildArticleProfile,
  buildBrandProfile,
  buildFaqProfile,
  buildPhysicianProfile,
  buildServiceProfile,
  buildTestimonialProfile,
} from '@geo/geo-core';

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];
function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

const opts = { publicBaseUrl: 'https://geo.studio', tenantSlug: 'demo-dental' };

// ─── 1. MedicalBusiness ────────────────────────────────────────────────
{
  const profile = buildBrandProfile(
    {
      id: 'b1',
      tenant_id: 't1',
      name: '松鼠口腔',
      location: { city: '昆明', district: '西山', address: '某路 100', lat: 24.95, lng: 102.7 },
      contact_phones: ['400-12345'],
      medical_specialties: ['Dentistry'],
      business_hours: { mon: '09:00-18:00', tue: '09:00-18:00', sun: '' },
      website_url: 'https://songshu.com',
      social_urls: { wechat_mp: 'https://mp.weixin.qq.com/x' },
      description_md: '专业种植 / 隐形矫正',
      verified_credentials: { licenses: [{ name: '医疗机构执业许可证' }], accreditations: [] },
      updated_at: new Date('2026-05-01'),
    },
    opts,
  );
  const s = buildMedicalBusinessSchema(profile);
  record('MedicalBusiness: @type set', s['@type'] === 'MedicalBusiness');
  record('MedicalBusiness: @id = url', s['@id'] === 'https://songshu.com');
  record('MedicalBusiness: telephone = first phone', s.telephone === '400-12345');
  record('MedicalBusiness: address.streetAddress', (s.address as Record<string, unknown> | undefined)?.streetAddress === '某路 100');
  record('MedicalBusiness: geo lat/lng emitted', (s.geo as Record<string, unknown> | undefined)?.latitude === 24.95);
  record('MedicalBusiness: medicalSpecialty array', Array.isArray(s.medicalSpecialty));
  record('MedicalBusiness: hours specs filter empty days', Array.isArray(s.openingHoursSpecification) && (s.openingHoursSpecification as unknown[]).length === 2);
  record('MedicalBusiness: sameAs contains social URL', Array.isArray(s.sameAs) && (s.sameAs as string[]).includes('https://mp.weixin.qq.com/x'));
  record('MedicalBusiness: hasCredential present', Array.isArray(s.hasCredential) && (s.hasCredential as unknown[]).length === 1);
}

// ─── 2. Brand without specialties → Organization ───────────────────────
{
  const profile = buildBrandProfile(
    {
      id: 'b2', tenant_id: 't1', name: 'Generic',
      location: null, contact_phones: [], medical_specialties: [],
      business_hours: {}, website_url: null, social_urls: {},
      description_md: null, verified_credentials: {}, updated_at: new Date(),
    },
    opts,
  );
  const s = buildMedicalBusinessSchema(profile);
  record('Organization fallback when no specialties', s['@type'] === 'Organization');
  record('Organization: empty fields dropped (D18)', s.telephone === undefined && s.address === undefined && s.medicalSpecialty === undefined);
}

// ─── 3. Physician ───────────────────────────────────────────────────────
{
  const profile = buildPhysicianProfile(
    {
      id: 's1', tenant_id: 't1', brand_id: 'b1',
      real_name: '张医生', role: 'doctor', persona: {},
      credentials: {
        license_number: 'PHY-001',
        specialties: ['种植'],
        board_certifications: ['CDA'],
        experience_years: 12,
        education: [{ degree: 'DDS', school: '北大口腔', year: 2010 }],
      },
      bio_md_path: null,
      updated_at: new Date(),
    },
    { ...opts, bioBody: '12 年临床' },
  );
  const s = buildPhysicianSchema(profile);
  record('Physician: @type', s['@type'] === 'Physician');
  record('Physician: jobTitle from role', s.jobTitle === 'doctor');
  record('Physician: medicalSpecialty list', Array.isArray(s.medicalSpecialty) && (s.medicalSpecialty as string[])[0] === '种植');
  record('Physician: hasCredential merges certs + degrees', Array.isArray(s.hasCredential) && (s.hasCredential as unknown[]).length === 2);
  record('Physician: identifier carries license', (s.identifier as Record<string, unknown> | undefined)?.value === 'PHY-001');
  record('Physician: experience_years in additionalProperty', Array.isArray(s.additionalProperty));
  record('Physician: worksFor @id refs brand', (s.worksFor as Record<string, unknown> | undefined)?.['@id'] === 'https://geo.studio/c/demo-dental');
}

// ─── 4. MedicalProcedure ───────────────────────────────────────────────
{
  const profile = buildServiceProfile(
    {
      id: 'sv1', tenant_id: 't1', brand_id: 'b1',
      name: '集采种植牙', description_md: '描述',
      category: '种植',
      duration_minutes: 60,
      price_range: { min: 5000, max: 8000, typical: 6500 },
      medical_procedure_code: 'DENTAL_IMPLANT',
      updated_at: new Date(),
    },
    opts,
  );
  const s = buildMedicalProcedureSchema(profile);
  record('MedicalProcedure: @type', s['@type'] === 'MedicalProcedure');
  record('MedicalProcedure: code.codeValue', (s.code as Record<string, unknown> | undefined)?.codeValue === 'DENTAL_IMPLANT');
  record('MedicalProcedure: duration in PTnM', s.estimatedDuration === 'PT60M');
  record('MedicalProcedure: offers.lowPrice', (s.offers as Record<string, unknown> | undefined)?.lowPrice === 5000);
  record('MedicalProcedure: priceCurrency CNY', (s.offers as Record<string, unknown> | undefined)?.priceCurrency === 'CNY');
  record('MedicalProcedure: provider @id refs brand', (s.provider as Record<string, unknown> | undefined)?.['@id'] === 'https://geo.studio/c/demo-dental');
}

// Service fallback when no procedure_code
{
  const profile = buildServiceProfile(
    { id: 'sv2', tenant_id: 't', brand_id: 'b', name: 'X', description_md: null, category: null, duration_minutes: null, price_range: null, medical_procedure_code: null, updated_at: new Date() },
    opts,
  );
  const s = buildMedicalProcedureSchema(profile);
  record('Service fallback when no procedure_code', s['@type'] === 'Service');
  record('Service: code dropped (D18)', s.code === undefined);
  record('Service: offers dropped when no price', s.offers === undefined);
}

// ─── 5. Review ──────────────────────────────────────────────────────────
{
  const profile = buildTestimonialProfile(
    { id: 'tm1', tenant_id: 't', brand_id: 'b', service_id: 'sv1', author_pseudonym: 'L 女士', body: '不错', rating: '4.5', attested_at: new Date('2026-04-10T12:00:00Z'), updated_at: new Date() },
    opts,
  );
  const s = buildReviewSchema(profile);
  record('Review: @type', s['@type'] === 'Review');
  record('Review: author Person', (s.author as Record<string, unknown> | undefined)?.['@type'] === 'Person');
  record('Review: rating value', (s.reviewRating as Record<string, unknown> | undefined)?.ratingValue === 4.5);
  record('Review: bestRating = 5', (s.reviewRating as Record<string, unknown> | undefined)?.bestRating === 5);
  record('Review: datePublished is YYYY-MM-DD', s.datePublished === '2026-04-10');
  record('Review: itemReviewed refs MedicalProcedure when service_id', (s.itemReviewed as Record<string, unknown> | undefined)?.['@type'] === 'MedicalProcedure');
}

// Review without service_id → itemReviewed = MedicalBusiness
{
  const profile = buildTestimonialProfile(
    { id: 'tm2', tenant_id: 't', brand_id: 'b', service_id: null, author_pseudonym: 'X', body: 'good', rating: null, attested_at: new Date(), updated_at: new Date() },
    opts,
  );
  const s = buildReviewSchema(profile);
  record('Review: itemReviewed = MedicalBusiness when no service', (s.itemReviewed as Record<string, unknown> | undefined)?.['@type'] === 'MedicalBusiness');
  record('Review: rating dropped when null (D18)', s.reviewRating === undefined);
}

// ─── 6. FAQPage ─────────────────────────────────────────────────────────
{
  const f1 = buildFaqProfile({ id: 'f1', tenant_id: 't', brand_id: null, question: '医保?', answer_md: '可以', category: null, updated_at: new Date() }, opts);
  const f2 = buildFaqProfile({ id: 'f2', tenant_id: 't', brand_id: null, question: '价格?', answer_md: '看具体', category: null, updated_at: new Date() }, opts);
  const s = buildFaqPageSchema([f1, f2], { pageUrl: 'https://geo.studio/c/demo-dental/faqs' });
  record('FAQPage: @type', s?.['@type'] === 'FAQPage');
  record('FAQPage: mainEntity = Question[]', Array.isArray(s?.mainEntity) && (s?.mainEntity as unknown[]).length === 2);
  record('FAQPage: each Q has acceptedAnswer', !!((s?.mainEntity as Array<Record<string, unknown>>)[0]?.acceptedAnswer));
}
{
  const s = buildFaqPageSchema([], { pageUrl: 'x' });
  record('FAQPage: empty array returns null', s === null);
}

// ─── 7. BreadcrumbList ─────────────────────────────────────────────────
{
  const s = buildBreadcrumbSchema([
    { name: '首页', url: 'https://x.com/' },
    { name: '医生', url: 'https://x.com/doctors' },
  ]);
  record('Breadcrumb: @type', s?.['@type'] === 'BreadcrumbList');
  record('Breadcrumb: positions 1..N', ((s?.itemListElement as Array<Record<string, unknown>>)[0]?.position) === 1 && ((s?.itemListElement as Array<Record<string, unknown>>)[1]?.position) === 2);
  record('Breadcrumb: empty returns null', buildBreadcrumbSchema([]) === null);
}

// ─── 8. Article ─────────────────────────────────────────────────────────
{
  const profile = buildArticleProfile(
    { id: 'c1', tenant_id: 't', title: '种植牙术后护理', markdown: '术后第一周\n\n避免硬食。', status: 'published', created_at: new Date('2026-04-20'), updated_at: new Date('2026-04-22') },
    { ...opts, authorName: '张医生' },
  );
  const s = buildArticleSchema(profile);
  record('Article: @type MedicalWebPage', s['@type'] === 'MedicalWebPage');
  record('Article: headline', s.headline === '种植牙术后护理');
  record('Article: datePublished YYYY-MM-DD', s.datePublished === '2026-04-20');
  record('Article: author Physician', (s.author as Record<string, unknown> | undefined)?.['@type'] === 'Physician');
}

// ─── 9. dispatcher ───────────────────────────────────────────────────────
{
  const brandProfile = buildBrandProfile(
    { id: 'b', tenant_id: 't', name: 'X', location: null, contact_phones: [], medical_specialties: ['Dentistry'], business_hours: {}, website_url: null, social_urls: {}, description_md: null, verified_credentials: {}, updated_at: new Date() },
    opts,
  );
  record('dispatcher: brand → MedicalBusiness', buildSchemaForProfile(brandProfile)['@type'] === 'MedicalBusiness');

  const physProfile = buildPhysicianProfile(
    { id: 's', tenant_id: 't', brand_id: 'b', real_name: 'Dr X', role: 'doctor', persona: {}, credentials: {}, bio_md_path: null, updated_at: new Date() },
    opts,
  );
  record('dispatcher: physician → Physician', buildSchemaForProfile(physProfile)['@type'] === 'Physician');

  const faqProfile = buildFaqProfile({ id: 'f', tenant_id: 't', brand_id: null, question: 'Q', answer_md: 'A', category: null, updated_at: new Date() }, opts);
  let threwForFaq = false;
  try { buildSchemaForProfile(faqProfile); } catch { threwForFaq = true; }
  record('dispatcher: faq throws (use collection builder)', threwForFaq);
}

// ─── tally ──────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
