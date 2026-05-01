/**
 * Build a FaqProfile from a faqs row.
 */

import type { FaqProfile } from '../types';

type FaqRow = {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  question: string;
  answer_md: string;
  category: string | null;
  updated_at: Date | string;
};

type BuildFaqOpts = {
  publicBaseUrl: string;
  tenantSlug: string;
};

export function buildFaqProfile(row: FaqRow, opts: BuildFaqOpts): FaqProfile {
  return {
    kind: 'faq',
    id: row.id,
    tenant_id: row.tenant_id,
    brand_id: row.brand_id || undefined,
    url: `${opts.publicBaseUrl}/c/${opts.tenantSlug}/faqs#${row.id}`,
    question: row.question,
    answer: row.answer_md,
    category: row.category || undefined,
    updated_at: toIsoString(row.updated_at),
  };
}

function toIsoString(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}
