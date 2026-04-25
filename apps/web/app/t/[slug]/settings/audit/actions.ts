'use server';

import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type AuditRow = {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  actor_user_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Fetch a flat slice of audit_logs for export. Server-action so RLS / role
 * checks happen server-side. Capped to 5000 rows to bound memory; if a tenant
 * has more, narrow the time range.
 */
export async function queryAuditLogs(
  tenantSlug: string,
  filters: { action?: string; from?: string; to?: string },
): Promise<AuditRow[]> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'auditor']);
  const supabase = createSupabaseServerClient();

  let q = supabase
    .from('audit_logs')
    .select('id, action, target_type, target_id, actor_user_id, payload, created_at')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (filters.action) q = q.like('action', `${filters.action}%`);
  if (filters.from) q = q.gte('created_at', filters.from);
  if (filters.to) q = q.lte('created_at', filters.to);

  const { data, error } = await q;
  if (error) throw new Error(`查询失败: ${error.message}`);
  return (data ?? []) as AuditRow[];
}
