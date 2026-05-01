/**
 * llms.txt + llms-full.txt generators.
 *
 * Format follows the community spec at https://llmstxt.org with our
 * additions for medical-vertical context. Two flavors:
 *
 *   - llms.txt        Compact navigation. Markdown-style, ~5-15KB. The
 *                     primary signal AI crawlers consume.
 *   - llms-full.txt   Same structure but with full content embedded
 *                     (article bodies, full FAQ answers). ~50-200KB.
 *
 * Pure functions: take ArtifactInput, return string. The aggregation +
 * filtering is the worker's job (apps/worker/src/jobs/discoverability-
 * regenerate.ts) — by the time we see profiles here, they're already
 * gated.
 */

import type { ArtifactInput } from './artifact-input';

const MAX_LLMS_FULL_BYTES = 200 * 1024; // soft cap; truncate articles if exceeded

export function generateLlmsTxt(input: ArtifactInput): string {
  const lines: string[] = [];
  const { brand } = input;

  // Title + tagline (per llmstxt.org spec)
  lines.push(`# ${brand.name}`);
  lines.push('');
  if (brand.description) {
    // Single-line tagline: take first sentence (up to first 。/. or 200 chars)
    const tagline = firstSentence(brand.description, 200);
    lines.push(`> ${tagline}`);
    lines.push('');
  }

  // Brand context block
  const ctx: string[] = [];
  if (brand.medical_specialties.length > 0) {
    ctx.push(`**Medical specialties**: ${brand.medical_specialties.join(', ')}`);
  }
  if (brand.address?.city) {
    const addr = [brand.address.district, brand.address.city, brand.address.region]
      .filter(Boolean)
      .join(', ');
    ctx.push(`**Location**: ${addr}`);
  }
  if (brand.contact_phones.length > 0) {
    ctx.push(`**Phone**: ${brand.contact_phones.join(' / ')}`);
  }
  if (brand.business_hours) {
    const hrs = formatHours(brand.business_hours);
    if (hrs) ctx.push(`**Hours**: ${hrs}`);
  }
  if (ctx.length > 0) {
    lines.push(...ctx);
    lines.push('');
  }

  // Doctors
  if (input.physicians.length > 0) {
    lines.push('## Doctors');
    lines.push('');
    for (const p of input.physicians) {
      const tags: string[] = [];
      if (p.specialties.length > 0) tags.push(p.specialties.join(' / '));
      if (p.experience_years !== undefined) tags.push(`${p.experience_years} yrs`);
      const suffix = tags.length > 0 ? ` — ${tags.join(', ')}` : '';
      lines.push(`- [${p.name}](${p.url})${suffix}`);
    }
    lines.push('');
  }

  // Services
  if (input.services.length > 0) {
    lines.push('## Services');
    lines.push('');
    const byCategory = new Map<string, typeof input.services>();
    for (const s of input.services) {
      const key = s.category ?? 'General';
      const arr = byCategory.get(key) ?? [];
      arr.push(s);
      byCategory.set(key, arr);
    }
    for (const [cat, items] of byCategory) {
      lines.push(`### ${cat}`);
      lines.push('');
      for (const s of items) {
        const price = formatPrice(s.price_range);
        const suffix = price ? ` — ${price}` : '';
        lines.push(`- [${s.name}](${s.url})${suffix}`);
      }
      lines.push('');
    }
  }

  // Articles (canonical written content)
  if (input.articles.length > 0) {
    lines.push('## Articles');
    lines.push('');
    for (const a of input.articles) {
      const date = a.published_at?.split('T')[0] ?? '';
      const datePrefix = date ? `(${date}) ` : '';
      lines.push(`- ${datePrefix}[${a.headline}](${a.url})`);
    }
    lines.push('');
  }

  // FAQ
  if (input.faqs.length > 0) {
    lines.push('## FAQ');
    lines.push('');
    lines.push(`See full Q&A: ${input.public_base_url}/c/${input.tenant_slug}/faqs`);
    lines.push('');
    for (const f of input.faqs.slice(0, 20)) {
      lines.push(`- **${f.question}** — ${condense(f.answer, 120)}`);
    }
    lines.push('');
  }

  // Testimonials (count only — body in llms-full)
  if (input.testimonials.length > 0) {
    lines.push('## Reviews');
    lines.push('');
    const ratings = input.testimonials
      .map((t) => t.rating)
      .filter((r): r is number => r !== undefined);
    const avg =
      ratings.length > 0
        ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
        : null;
    if (avg) lines.push(`${input.testimonials.length} verified reviews · avg ${avg}/5.0`);
    else lines.push(`${input.testimonials.length} verified reviews`);
    lines.push(`See: ${input.public_base_url}/c/${input.tenant_slug}/testimonials`);
    lines.push('');
  }

  // Metadata footer
  lines.push('---');
  lines.push(`Generated: ${input.generated_at}`);
  lines.push(`Source: ${input.public_base_url}/c/${input.tenant_slug}`);

  return lines.join('\n');
}

export function generateLlmsTxtFull(input: ArtifactInput): string {
  const lines: string[] = [];
  const { brand } = input;

  lines.push(`# ${brand.name}`);
  lines.push('');
  if (brand.description) {
    lines.push(brand.description);
    lines.push('');
  }

  // Doctor profiles with bio
  if (input.physicians.length > 0) {
    lines.push('## Doctors');
    lines.push('');
    for (const p of input.physicians) {
      lines.push(`### ${p.name}`);
      lines.push('');
      if (p.role) lines.push(`*${p.role}*`);
      if (p.specialties.length > 0) lines.push(`Specialties: ${p.specialties.join(', ')}`);
      if (p.experience_years !== undefined) {
        lines.push(`Experience: ${p.experience_years} years`);
      }
      if (p.education.length > 0) {
        lines.push(`Education: ${p.education.map((e) => e.degree + (e.school ? ` (${e.school})` : '')).join('; ')}`);
      }
      if (p.description) {
        lines.push('');
        lines.push(p.description);
      }
      lines.push('');
    }
  }

  // Full services
  if (input.services.length > 0) {
    lines.push('## Services');
    lines.push('');
    for (const s of input.services) {
      lines.push(`### ${s.name}`);
      lines.push('');
      if (s.category) lines.push(`Category: ${s.category}`);
      const price = formatPrice(s.price_range);
      if (price) lines.push(`Price: ${price}`);
      if (s.duration_minutes !== undefined) lines.push(`Duration: ${s.duration_minutes} min`);
      if (s.description) {
        lines.push('');
        lines.push(s.description);
      }
      lines.push('');
    }
  }

  // Full articles (truncated if total exceeds size cap)
  if (input.articles.length > 0) {
    lines.push('## Articles');
    lines.push('');
    let bytesUsed = lines.join('\n').length;
    for (const a of input.articles) {
      const block = [
        `### ${a.headline}`,
        '',
        a.published_at ? `Published: ${a.published_at.split('T')[0]}` : '',
        a.author_name ? `Author: ${a.author_name}` : '',
        '',
        a.body,
        '',
      ]
        .filter(Boolean)
        .join('\n');
      if (bytesUsed + block.length > MAX_LLMS_FULL_BYTES) {
        lines.push('*(remaining articles truncated to keep file under 200KB)*');
        break;
      }
      lines.push(block);
      bytesUsed += block.length;
    }
  }

  // FAQ full
  if (input.faqs.length > 0) {
    lines.push('## FAQ');
    lines.push('');
    for (const f of input.faqs) {
      lines.push(`**${f.question}**`);
      lines.push('');
      lines.push(f.answer);
      lines.push('');
    }
  }

  // Testimonials full
  if (input.testimonials.length > 0) {
    lines.push('## Reviews');
    lines.push('');
    for (const t of input.testimonials) {
      const rating = t.rating !== undefined ? ` (${t.rating}/5)` : '';
      lines.push(`> ${t.body}`);
      lines.push(`> — ${t.author}${rating}, ${t.attested_at.split('T')[0]}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(`Generated: ${input.generated_at}`);
  return lines.join('\n');
}

function firstSentence(text: string, maxChars: number): string {
  const m = text.match(/^([^。.\n]{1,500}[。.])/);
  const candidate = m?.[1] ?? text;
  if (candidate.length <= maxChars) return candidate.trim();
  return `${candidate.slice(0, maxChars).trim()}…`;
}

function condense(text: string, maxChars: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length <= maxChars ? oneLine : `${oneLine.slice(0, maxChars).trim()}…`;
}

function formatPrice(p?: { min?: number; max?: number; typical?: number; currency?: string }): string | null {
  if (!p) return null;
  const cur = p.currency ?? 'CNY';
  const sym = cur === 'CNY' ? '¥' : `${cur} `;
  if (p.min !== undefined && p.max !== undefined) {
    return `${sym}${p.min.toLocaleString('en-US')}–${p.max.toLocaleString('en-US')}`;
  }
  if (p.typical !== undefined) return `${sym}${p.typical.toLocaleString('en-US')}`;
  if (p.min !== undefined) return `from ${sym}${p.min.toLocaleString('en-US')}`;
  return null;
}

const DAY_LABELS: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

function formatHours(hours: Record<string, string | undefined>): string | null {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(hours)) {
    if (typeof v !== 'string' || v.length === 0) continue;
    const label = DAY_LABELS[k];
    if (label) parts.push(`${label} ${v}`);
  }
  return parts.length === 0 ? null : parts.join(' · ');
}
