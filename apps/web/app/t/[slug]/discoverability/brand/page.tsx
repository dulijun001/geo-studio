import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { BrandForm } from './brand-form';

export const dynamic = 'force-dynamic';

export default async function BrandEditPage({ params }: { params: { slug: string } }) {
  const tenant = await requireRole(params.slug, ['owner', 'admin']);
  const supabase = createSupabaseServerClient();

  const { data: brand } = await supabase
    .from('brands')
    .select(
      'id, name, location, contact_phones, medical_specialties, business_hours, website_url, social_urls, description_md, verified_credentials',
    )
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!brand) notFound();

  const loc = (brand.location as Record<string, unknown>) ?? {};
  const social = (brand.social_urls as Record<string, unknown>) ?? {};
  const hours = (brand.business_hours as Record<string, unknown>) ?? {};
  const vc = (brand.verified_credentials as Record<string, unknown>) ?? {};
  const licenses = Array.isArray(vc.licenses) ? (vc.licenses as Array<Record<string, unknown>>) : [];

  const initial = {
    city: stringField(loc.city),
    district: stringField(loc.district),
    address: stringField(loc.address),
    postal_code: stringField(loc.postal_code),
    region: stringField(loc.region),
    country: stringField(loc.country),
    latitude: typeof loc.lat === 'number' ? loc.lat : null,
    longitude: typeof loc.lng === 'number' ? loc.lng : null,
    description_md: brand.description_md ?? '',
    medical_specialties: (brand.medical_specialties ?? []) as string[],
    business_hours: {
      mon: stringField(hours.mon),
      tue: stringField(hours.tue),
      wed: stringField(hours.wed),
      thu: stringField(hours.thu),
      fri: stringField(hours.fri),
      sat: stringField(hours.sat),
      sun: stringField(hours.sun),
    },
    website_url: brand.website_url ?? '',
    social_urls: {
      wechat_mp: stringField(social.wechat_mp),
      weibo: stringField(social.weibo),
      douyin: stringField(social.douyin),
      xiaohongshu: stringField(social.xiaohongshu),
    },
    credentials: licenses.map((l) => ({
      name: stringField(l.name),
      issuer: stringField(l.issuer),
      number: stringField(l.number),
    })),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="品牌资料"
        subtitle={`${brand.name} — 这些字段直接喂进 schema.org/MedicalBusiness + llms.txt + feed`}
        actions={
          <Link
            href={`/t/${tenant.slug}/discoverability`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            ← 可发现层
          </Link>
        }
      />
      <BrandForm tenantSlug={tenant.slug} initial={initial} />
    </div>
  );
}

function stringField(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
