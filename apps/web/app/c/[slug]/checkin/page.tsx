import { CheckinForm } from './checkin-form';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

/**
 * Public conversion check-in page. No auth — the patient (or front desk)
 * fills in the 6-char activity code printed on the variant they read, plus
 * which funnel stage they're at.
 *
 * Why this lives at /c/[slug] and not /t/[slug]: the /t/* tree assumes the
 * visitor has a tenant_membership; this is for end customers.
 */
export default async function CheckinPage({ params }: { params: { slug: string } }) {
  const service = getSupabaseServiceClient();
  const { data: tenant } = await service
    .from('tenants')
    .select('name, slug')
    .eq('slug', params.slug)
    .single();
  if (!tenant) {
    return (
      <div className="mx-auto max-w-md px-6 py-12 text-center text-sm text-muted-foreground">
        门店未找到。
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md px-6 py-10 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{tenant.name}</h1>
        <p className="text-sm text-muted-foreground">就诊登记 · 输入暗号告诉我们你是怎么找到我们的</p>
      </header>
      <CheckinForm slug={params.slug} />
      <p className="text-xs text-muted-foreground">
        暗号通常 6 位,大小写不敏感,在医生给你看的内容里。如果记不清也可以直接告诉前台医生姓名。
      </p>
    </div>
  );
}
