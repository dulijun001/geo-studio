import type PgBoss from 'pg-boss';
import { handleComplianceReview, type ComplianceReviewJob } from './compliance-review';
import { handleGeoSnapshot, type GeoSnapshotJob } from './geo-snapshot';
import { handleParseContent, type ParseContentJob } from './parse-content';
import { handleVariantGenerate, type VariantGenerateJob } from './variant-generate';

export const JOBS = {
  CONTENT_PARSE: 'content.parse',
  COMPLIANCE_REVIEW: 'compliance.review', // W4
  VARIANT_GENERATE: 'content.variant_generate', // W3.2
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

  await boss.work<ComplianceReviewJob>(JOBS.COMPLIANCE_REVIEW, async ([job]) => {
    if (!job?.data) return;
    await handleComplianceReview(job.data);
  });

  await boss.work<VariantGenerateJob>(JOBS.VARIANT_GENERATE, async ([job]) => {
    if (!job?.data) return;
    await handleVariantGenerate(job.data);
  });

  await boss.work<GeoSnapshotJob>(JOBS.GEO_SNAPSHOT, async ([job]) => {
    if (!job?.data) return;
    await handleGeoSnapshot(job.data);
  });

  // Placeholders for later weeks — log receipt so we can verify wiring.
  for (const job of [JOBS.HOOK_PROVISION]) {
    await boss.work(job, async ([msg]) => {
      console.log(`[job:${job}] received`, msg?.id);
    });
  }
}
