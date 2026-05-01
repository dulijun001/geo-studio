/**
 * Smoke test for V1.7 Discoverability profile builders.
 *
 * Pure-function tests (no DB). Run: pnpm --filter @geo/db test-discoverability
 *
 * Validates:
 *   1. Each builder produces the right `kind`
 *   2. Empty / null inputs are dropped per D18 (don't emit placeholder fields)
 *   3. Type narrowing via isProfileKind works
 *   4. URL composition follows convention
 */

import {
  buildArticleProfile,
  buildBrandProfile,
  buildFaqProfile,
  buildPhysicianProfile,
  buildServiceProfile,
  buildTestimonialProfile,
  isProfileKind,
} from '@geo/geo-core';

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];
function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

const opts = {
  publicBaseUrl: 'https://geo.studio',
  tenantSlug: 'demo-dental',
};

// ─── 1. brand ───────────────────────────────────────────────────────────
{
  const profile = buildBrandProfile(
    {
      id: 'b1',
      tenant_id: 't1',
      name: '松鼠口腔',
      location: { city: '昆明', district: '西山区', address: '某某路 100 号', lat: 24.95 },
      contact_phones: ['400-12345'],
      medical_specialties: ['Dentistry', 'OrthopaedicSurgery'],
      business_hours: { mon: '09:00-18:00', sun: '' },
      website_url: 'https://songshu.com',
      social_urls: { wechat_mp: 'https://mp.weixin.qq.com/...', empty: '' },
      description_md: '专业种植 / 隐形矫正',
      verified_credentials: {
        licenses: [{ name: '医疗机构执业许可证', issuer: '昆明卫健委', number: 'KM-12345' }],
        accreditations: [],
      },
      updated_at: new Date('2026-05-01T00:00:00Z'),
    },
    opts,
  );

  record('brand: kind = brand', profile.kind === 'brand');
  record('brand: url uses website_url when set', profile.url === 'https://songshu.com');
  record('brand: address parses lat into latitude', profile.address?.latitude === 24.95);
  record('brand: business_hours filters invalid days', profile.business_hours?.mon === '09:00-18:00' && profile.business_hours?.sun === undefined);
  record('brand: social_urls drops empty string values', profile.social_urls?.empty === undefined && profile.social_urls?.wechat_mp !== undefined);
  record('brand: credentials flattened from licenses + accreditations', profile.credentials.length === 1);
  record('brand: medical_specialties passed through', profile.medical_specialties.length === 2);
}

// ─── 2. brand: empty fields dropped (D18) ────────────────────────────────
{
  const profile = buildBrandProfile(
    {
      id: 'b2',
      tenant_id: 't1',
      name: 'Empty',
      location: null,
      contact_phones: [],
      medical_specialties: [],
      business_hours: {},
      website_url: '',
      social_urls: {},
      description_md: '   ',
      verified_credentials: {},
      updated_at: new Date(),
    },
    opts,
  );
  record('brand-empty: url falls back to public base', profile.url === 'https://geo.studio/c/demo-dental');
  record('brand-empty: description_md (whitespace only) becomes undefined', profile.description === undefined);
  record('brand-empty: address omitted', profile.address === undefined);
  record('brand-empty: business_hours omitted (empty days dict)', profile.business_hours === undefined);
  record('brand-empty: credentials = []', profile.credentials.length === 0);
}

// ─── 3. physician ───────────────────────────────────────────────────────
{
  const profile = buildPhysicianProfile(
    {
      id: 's1',
      tenant_id: 't1',
      brand_id: 'b1',
      real_name: '张医生',
      role: 'doctor',
      persona: { tone: 'warm' },
      credentials: {
        license_number: 'PHY-001',
        specialties: ['种植牙', '口腔修复'],
        board_certifications: ['CDA Board Certified'],
        experience_years: 12,
        education: [{ degree: 'DDS', school: '北大口腔', year: 2010 }],
      },
      bio_md_path: 'team/doctors/zhang.md',
      updated_at: new Date(),
    },
    { ...opts, bioBody: '张医生有 12 年种植牙临床经验。' },
  );
  record('physician: kind = physician', profile.kind === 'physician');
  record('physician: license_number set', profile.license_number === 'PHY-001');
  record('physician: experience_years parsed', profile.experience_years === 12);
  record('physician: education list', profile.education.length === 1 && profile.education[0]?.degree === 'DDS');
  record('physician: description from bioBody', profile.description?.includes('12 年') === true);
  record('physician: url has /doctors/<id>', profile.url === 'https://geo.studio/c/demo-dental/doctors/s1');
}

// ─── 4. service ─────────────────────────────────────────────────────────
{
  const profile = buildServiceProfile(
    {
      id: 'sv1',
      tenant_id: 't1',
      brand_id: 'b1',
      name: '集采种植牙',
      description_md: '集采种植牙描述',
      category: '种植',
      duration_minutes: 60,
      price_range: { min: 5000, max: 8000, typical: 6500 },
      medical_procedure_code: 'DENTAL_IMPLANT',
      updated_at: new Date(),
    },
    opts,
  );
  record('service: kind = service', profile.kind === 'service');
  record('service: price_range.currency defaults to CNY', profile.price_range?.currency === 'CNY');
  record('service: procedure_code', profile.procedure_code === 'DENTAL_IMPLANT');
}

{
  const profile = buildServiceProfile(
    {
      id: 'sv2',
      tenant_id: 't1',
      brand_id: 'b1',
      name: 'Empty pricing',
      description_md: null,
      category: null,
      duration_minutes: null,
      price_range: {},
      medical_procedure_code: null,
      updated_at: new Date(),
    },
    opts,
  );
  record('service-empty: price_range = undefined when all values empty', profile.price_range === undefined);
}

// ─── 5. testimonial ─────────────────────────────────────────────────────
{
  const profile = buildTestimonialProfile(
    {
      id: 'tm1',
      tenant_id: 't1',
      brand_id: 'b1',
      service_id: 'sv1',
      author_pseudonym: 'L 女士 / 32 岁 / 南京',
      body: '种牙后恢复很顺利。',
      rating: '4.5',
      attested_at: new Date('2026-04-10T00:00:00Z'),
      updated_at: new Date(),
    },
    opts,
  );
  record('testimonial: kind = testimonial', profile.kind === 'testimonial');
  record('testimonial: rating parsed from numeric string', profile.rating === 4.5);
  record('testimonial: out-of-range rating dropped', buildTestimonialProfile(
    { id: 'x', tenant_id: 't', brand_id: 'b', service_id: null, author_pseudonym: 'X', body: '', rating: '6.0', attested_at: new Date(), updated_at: new Date() },
    opts,
  ).rating === undefined);
}

// ─── 6. faq ─────────────────────────────────────────────────────────────
{
  const profile = buildFaqProfile(
    {
      id: 'f1',
      tenant_id: 't1',
      brand_id: null,
      question: '医保能报销吗?',
      answer_md: '部分项目支持医保报销...',
      category: '价格',
      updated_at: new Date(),
    },
    opts,
  );
  record('faq: kind = faq', profile.kind === 'faq');
  record('faq: brand_id null → undefined', profile.brand_id === undefined);
  record('faq: url anchored on faqs page', profile.url === 'https://geo.studio/c/demo-dental/faqs#f1');
}

// ─── 7. article ─────────────────────────────────────────────────────────
{
  const profile = buildArticleProfile(
    {
      id: 'c1',
      tenant_id: 't1',
      title: '种植牙术后护理',
      markdown: '术后第一周\n\n避免硬食。',
      status: 'published',
      created_at: new Date('2026-04-20T00:00:00Z'),
      updated_at: new Date('2026-04-22T00:00:00Z'),
    },
    { ...opts, authorName: '张医生' },
  );
  record('article: kind = article', profile.kind === 'article');
  record('article: summary extracts first paragraph', profile.summary === '术后第一周');
  record('article: published_at defaults to created_at', profile.published_at === '2026-04-20T00:00:00.000Z');
}

// ─── 8. type narrowing ──────────────────────────────────────────────────
{
  const p = buildBrandProfile(
    { id: 'b3', tenant_id: 't', name: 'X', location: null, contact_phones: [], medical_specialties: [], business_hours: {}, website_url: null, social_urls: {}, description_md: null, verified_credentials: {}, updated_at: new Date() },
    opts,
  );
  record('isProfileKind: narrows correctly', isProfileKind(p, 'brand') && p.medical_specialties.length === 0);
  record('isProfileKind: false for wrong kind', !isProfileKind(p, 'service'));
}

// ─── tally ──────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
