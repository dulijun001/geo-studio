import { getSupabaseServiceClient } from './supabase/service';

const DEFAULT_KB_ROOT =
  process.env.KNOWLEDGE_BASE_ROOT ??
  `${process.env.HOME}/Workspace/songshu-knowledge-base`;

const kbRootCache = new Map<string, { path: string; fetchedAt: number }>();
const CACHE_TTL_MS = 60_000;

/**
 * Resolve a tenant's knowledge base filesystem root.
 * Reads `tenants.knowledge_base_path` with a 60s in-memory cache;
 * falls back to `KNOWLEDGE_BASE_ROOT` / default path when not configured.
 */
export async function resolveKbRoot(tenantId?: string | null): Promise<string> {
  if (!tenantId) return DEFAULT_KB_ROOT;

  const cached = kbRootCache.get(tenantId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.path;
  }

  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from('tenants')
      .select('knowledge_base_path')
      .eq('id', tenantId)
      .maybeSingle();

    if (!error && data?.knowledge_base_path) {
      const resolved = String(data.knowledge_base_path).trim();
      if (resolved) {
        kbRootCache.set(tenantId, { path: resolved, fetchedAt: Date.now() });
        return resolved;
      }
    }
  } catch (err) {
    console.warn(`[resolveKbRoot] Failed to query knowledge_base_path for tenant=${tenantId}:`, err);
  }

  kbRootCache.set(tenantId, { path: DEFAULT_KB_ROOT, fetchedAt: Date.now() });
  return DEFAULT_KB_ROOT;
}

export function getDefaultKbRoot(): string {
  return DEFAULT_KB_ROOT;
}
