'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const INDUSTRIES = [
  { value: 'dental', label: '口腔' },
  { value: 'medical_beauty', label: '医美' },
  { value: 'maternity', label: '月子中心' },
  { value: 'hair_transplant', label: '植发' },
  { value: 'law', label: '律所' },
  { value: 'accounting', label: '会计' },
  { value: 'education', label: '教育' },
  { value: 'hospital', label: '民营医院' },
  { value: 'fitness', label: '健身' },
  { value: 'pet', label: '宠物' },
  { value: 'other', label: '其他' },
] as const;

export function CreateTenantForm({
  defaultName,
  defaultSlug,
}: {
  defaultName: string;
  defaultSlug: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [slug, setSlug] = useState(defaultSlug);
  const [industry, setIndustry] = useState('dental');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.rpc('create_tenant_as_owner', {
      p_name: name.trim(),
      p_slug: slug.trim().toLowerCase(),
      p_industry: industry,
    });

    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push(`/t/${slug.trim().toLowerCase()}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">机构名称</span>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="XX 口腔医院"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">URL slug</span>
        <input
          type="text"
          required
          pattern="^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="xx-dental"
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent"
        />
        <span className="text-xs text-muted-foreground">
          3-40 字符,小写字母、数字、连字符。将用于 URL:/t/<strong>{slug || 'your-slug'}</strong>
        </span>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">行业</span>
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {INDUSTRIES.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={submitting || !name || !slug}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? '创建中…' : '创建租户'}
      </button>

      {error && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/[0.10] p-3 text-sm text-rose-300">
          {error}
        </p>
      )}
    </form>
  );
}
