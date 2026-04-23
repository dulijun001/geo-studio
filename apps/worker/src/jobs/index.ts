import type PgBoss from 'pg-boss';

/**
 * Job registry. Each job gets its own file under src/jobs/<name>.ts
 * with { name, handler } exports, wired in here.
 *
 * V0 placeholder — real jobs land in V1.
 */

export const JOBS = {
  CONTENT_PARSE: 'content.parse', // Word/PDF → markdown (V1 Week 3)
  COMPLIANCE_LLM_REVIEW: 'compliance.llm_review', // Stage 2 of three-gate (V1 Week 4)
  VARIANT_GENERATE: 'content.variant_generate', // Doubao rewrite into platform variants (V1 Week 3)
  GEO_SNAPSHOT: 'geo.snapshot', // Playwright track query (V1 Week 6)
  HOOK_PROVISION: 'publish.hook_provision', // Allocate attribution hooks (V1 Week 7)
} as const;

export async function registerJobs(boss: PgBoss): Promise<void> {
  // V1 placeholder: log receipt so we can verify wiring end-to-end.
  for (const job of Object.values(JOBS)) {
    await boss.work(job, async ([msg]) => {
      console.log(`[job:${job}] received`, msg?.id);
    });
  }
}
