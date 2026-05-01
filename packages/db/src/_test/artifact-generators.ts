/**
 * Smoke test for V1.7 artifact generators (llms.txt / feed / sitemap).
 *
 * Pure-function tests. Run: pnpm db:test-artifacts
 */

import {
  type ArtifactInput,
  buildArticleProfile,
  buildBrandProfile,
  buildFaqProfile,
  buildPhysicianProfile,
  buildServiceProfile,
  buildTestimonialProfile,
  generateAiSitemap,
  generateContentFeed,
  generateLlmsTxt,
  generateLlmsTxtFull,
} from '@geo/geo-core';

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];
function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

const opts = { publicBaseUrl: 'https://geo.studio', tenantSlug: 'demo-dental' };

function makeInput(overrides: Partial<ArtifactInput> = {}): ArtifactInput {
  const brand = buildBrandProfile(
    {
      id: 'b1', tenant_id: 't1', name: '松鼠口腔',
      location: { city: '昆明', district: '西山', address: '某路 100', lat: 24.95, lng: 102.7 },
      contact_phones: ['400-12345'],
      medical_specialties: ['Dentistry'],
      business_hours: { mon: '09:00-18:00', tue: '09:00-18:00', sun: '' },
      website_url: 'https://songshu.com',
      social_urls: { wechat_mp: 'https://mp.weixin.qq.com/x' },
      description_md: '松鼠口腔提供专业种植 / 隐形矫正 / 儿牙等服务。',
      verified_credentials: { licenses: [{ name: '医疗机构执业许可证' }] },
      updated_at: new Date('2026-05-01'),
    },
    opts,
  );

  return {
    tenant_id: 't1',
    tenant_slug: 'demo-dental',
    public_base_url: 'https://geo.studio',
    generated_at: '2026-05-01T00:00:00Z',
    brand,
    physicians: [],
    services: [],
    testimonials: [],
    faqs: [],
    articles: [],
    ...overrides,
  };
}

// ─── 1. llms.txt minimum (brand only) ────────────────────────────────
{
  const out = generateLlmsTxt(makeInput());
  record('llms-txt: starts with # brand name', out.startsWith('# 松鼠口腔'));
  record('llms-txt: contains tagline blockquote', out.includes('> 松鼠口腔提供专业种植'));
  record('llms-txt: contains location line', out.includes('Location**: 西山'));
  record('llms-txt: empty sections omitted', !out.includes('## Doctors') && !out.includes('## Services'));
  record('llms-txt: footer source line present', out.includes('Source: https://geo.studio/c/demo-dental'));
}

// ─── 2. llms.txt full features ────────────────────────────────────────
{
  const physicians = [
    buildPhysicianProfile(
      { id: 's1', tenant_id: 't', brand_id: 'b', real_name: '张医生', role: 'doctor', persona: {}, credentials: { specialties: ['种植'], experience_years: 12 }, bio_md_path: null, updated_at: new Date() },
      { ...opts, bioBody: '12 年临床经验' },
    ),
  ];
  const services = [
    buildServiceProfile(
      { id: 'sv1', tenant_id: 't', brand_id: 'b', name: '集采种植牙', description_md: 'desc', category: '种植', duration_minutes: 60, price_range: { min: 5000, max: 8000, currency: 'CNY' }, medical_procedure_code: 'IMP', updated_at: new Date() },
      opts,
    ),
    buildServiceProfile(
      { id: 'sv2', tenant_id: 't', brand_id: 'b', name: '儿童涂氟', description_md: null, category: '儿牙', duration_minutes: 30, price_range: null, medical_procedure_code: null, updated_at: new Date() },
      opts,
    ),
  ];
  const faqs = [
    buildFaqProfile({ id: 'f1', tenant_id: 't', brand_id: null, question: '医保能报销吗?', answer_md: '部分项目可以报销,具体看材料和地区。', category: null, updated_at: new Date() }, opts),
  ];
  const testimonials = [
    buildTestimonialProfile({ id: 'tm1', tenant_id: 't', brand_id: 'b', service_id: null, author_pseudonym: 'L 女士', body: '不错', rating: '4.5', attested_at: new Date('2026-04-10'), updated_at: new Date() }, opts),
    buildTestimonialProfile({ id: 'tm2', tenant_id: 't', brand_id: 'b', service_id: null, author_pseudonym: 'W 先生', body: '满意', rating: '5.0', attested_at: new Date('2026-04-15'), updated_at: new Date() }, opts),
  ];

  const out = generateLlmsTxt(makeInput({ physicians, services, faqs, testimonials }));
  record('llms-txt: doctors section', out.includes('## Doctors') && out.includes('张医生') && out.includes('12 yrs'));
  record('llms-txt: services group by category', out.includes('### 种植') && out.includes('### 儿牙'));
  record('llms-txt: price formatted with ¥', out.includes('¥5,000–8,000'));
  record('llms-txt: faq section + condensed answer', out.includes('## FAQ') && out.includes('医保能报销'));
  record('llms-txt: review summary with avg rating', out.includes('2 verified reviews · avg 4.8/5.0'));
}

// ─── 3. llms-full.txt — full content embedded ──────────────────────────
{
  const articles = [
    buildArticleProfile(
      { id: 'c1', tenant_id: 't', title: '种植牙术后护理', markdown: '术后第一周\n\n避免硬食。详细注意事项如下。', status: 'published', created_at: new Date('2026-04-20'), updated_at: new Date() },
      { ...opts, authorName: '张医生' },
    ),
  ];
  const out = generateLlmsTxtFull(makeInput({ articles }));
  record('llms-full: full article body present', out.includes('避免硬食。详细注意事项如下。'));
  record('llms-full: section headers preserved', out.includes('### 种植牙术后护理'));
}

// ─── 4. AI Content Feed ─────────────────────────────────────────────────
{
  const out = generateContentFeed(makeInput({
    physicians: [
      buildPhysicianProfile(
        { id: 's1', tenant_id: 't', brand_id: 'b', real_name: 'Dr X', role: 'doctor', persona: {}, credentials: {}, bio_md_path: null, updated_at: new Date() },
        opts,
      ),
    ],
    services: [
      buildServiceProfile(
        { id: 'sv1', tenant_id: 't', brand_id: 'b', name: 'X', description_md: null, category: null, duration_minutes: null, price_range: null, medical_procedure_code: null, updated_at: new Date() },
        opts,
      ),
    ],
  }));
  const parsed = JSON.parse(out);
  record('feed: valid JSON', typeof parsed === 'object' && parsed !== null);
  record('feed: version field', parsed.version === '1.0');
  record('feed: brand is MedicalBusiness', parsed.brand['@type'] === 'MedicalBusiness');
  record('feed: physicians array', Array.isArray(parsed.physicians) && parsed.physicians.length === 1);
  record('feed: counts populated', parsed.counts.physicians === 1 && parsed.counts.services === 1);
}

// ─── 5. AI Sitemap ─────────────────────────────────────────────────────
{
  const services = [
    buildServiceProfile(
      { id: 'sv1', tenant_id: 't', brand_id: 'b', name: 'X', description_md: null, category: null, duration_minutes: null, price_range: null, medical_procedure_code: null, updated_at: new Date('2026-05-01') },
      opts,
    ),
  ];
  const out = generateAiSitemap(makeInput({ services }));
  record('sitemap: XML declaration', out.startsWith('<?xml version="1.0"'));
  record('sitemap: urlset namespace', out.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
  record('sitemap: brand homepage with priority 1.0', out.includes('<priority>1.0</priority>'));
  record('sitemap: service URL with priority 0.9', out.includes('<priority>0.9</priority>'));
  record('sitemap: lastmod present', out.includes('<lastmod>2026-05-01</lastmod>'));
  record('sitemap: escapes special chars', !generateAiSitemap(makeInput({
    services: [buildServiceProfile({ id: '<x&y>', tenant_id: 't', brand_id: 'b', name: 'X', description_md: null, category: null, duration_minutes: null, price_range: null, medical_procedure_code: null, updated_at: new Date() }, opts)],
  })).includes('<x&y>'));
}

// ─── tally ──────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
