import type PgBoss from 'pg-boss';
import { handleParseContent, type ParseContentJob } from './parse-content';

export const JOBS = {
  CONTENT_PARSE: 'content.parse',
  COMPLIANCE_LLM_REVIEW: 'compliance.llm_review', // W4
  VARIANT_GENERATE: 'content.variant_generate', // W3.4
  GEO_SNAPSHOT: 'geo.snapshot', // W6
  HOOK_PROVISION: 'publish.hook_provision', // W7
} as const;

export async function registerJobs(boss: PgBoss): Promise<void> {
  // pg-boss v10: queues must be created before send/work.
  for (const name of Object.values(JOBS)) {
    await boss.createQueue(name);
  }

  await boss.work<ParseContentJob>(JOBS.CONTENT_PARSE, async ([job]) => {
    if (!job?.data) return;
    await handleParseContent(job.data);
  });

  // Placeholders for later weeks — log receipt so we can verify wiring.
  for (const job of [
    JOBS.COMPLIANCE_LLM_REVIEW,
    JOBS.VARIANT_GENERATE,
    JOBS.GEO_SNAPSHOT,
    JOBS.HOOK_PROVISION,
  ]) {
    await boss.work(job, async ([msg]) => {
      console.log(`[job:${job}] received`, msg?.id);
    });
  }
}
