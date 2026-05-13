import type PgBoss from 'pg-boss';
import { handleBatchDraftItem, type BatchDraftItemJob } from './batch-draft-item';
import {
  handleComplianceAutoRewrite,
  type ComplianceAutoRewriteJob,
} from './compliance-auto-rewrite';
import { handleComplianceReview, type ComplianceReviewJob } from './compliance-review';
import { handleDailyReport, type DailyReportJob } from './daily-report';
import {
  handleDiscoverabilityRegenerate,
  type DiscoverabilityRegenerateJob,
} from './discoverability-regenerate';
import { handleGeoSnapshot, type GeoSnapshotJob } from './geo-snapshot';
import { handleGeoWeeklyBaseline, type GeoWeeklyBaselineJob } from './geo-weekly-baseline';
import { handleKnowledgeSync, type KnowledgeSyncJob } from './knowledge-sync';
import {
  handleWeeklyKnowledgeReport,
  type WeeklyKnowledgeReportJob,
} from './weekly-knowledge-report';
import { handleParseContent, type ParseContentJob } from './parse-content';
import { handleVariantGenerate, type VariantGenerateJob } from './variant-generate';

export const JOBS = {
  CONTENT_PARSE: 'content.parse',
  COMPLIANCE_REVIEW: 'compliance.review', // W4
  VARIANT_GENERATE: 'content.variant_generate', // W3.2
  GEO_SNAPSHOT: 'geo.snapshot', // W6
  HOOK_PROVISION: 'publish.hook_provision', // W7
  REPORTS_DAILY: 'reports.daily', // P1-10
  KNOWLEDGE_SYNC: 'knowledge.sync', // V1.5
  KNOWLEDGE_WEEKLY: 'knowledge.weekly_report', // V1.5-10
  GEO_WEEKLY_BASELINE: 'geo.weekly_baseline', // V1.6-2
  DISCOVERABILITY_REGENERATE: 'discoverability.regenerate', // V1.7
  BATCH_DRAFT_ITEM: 'content.batch_draft_item', // V1.9
  COMPLIANCE_AUTO_REWRITE: 'compliance.auto_rewrite', // P3 — auto LLM rewrite on reject (max 1×)
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

  await boss.work<DailyReportJob>(JOBS.REPORTS_DAILY, async ([job]) => {
    await handleDailyReport(job?.data ?? {});
  });

  await boss.work<KnowledgeSyncJob>(JOBS.KNOWLEDGE_SYNC, async ([job]) => {
    await handleKnowledgeSync(job?.data ?? {});
  });

  await boss.work<WeeklyKnowledgeReportJob>(JOBS.KNOWLEDGE_WEEKLY, async ([job]) => {
    await handleWeeklyKnowledgeReport(job?.data ?? {});
  });

  await boss.work<GeoWeeklyBaselineJob>(JOBS.GEO_WEEKLY_BASELINE, async ([job]) => {
    await handleGeoWeeklyBaseline(boss, job?.data ?? {});
  });

  await boss.work<DiscoverabilityRegenerateJob>(
    JOBS.DISCOVERABILITY_REGENERATE,
    async ([job]) => {
      if (!job?.data) return;
      await handleDiscoverabilityRegenerate(job.data);
    },
  );

  // P3 — Compliance auto-rewrite. Triggered ONLY by compliance-review when
  // a variant rejects + auto_rewrite_count = 0. Single-threaded is fine here:
  // rejects are sparse + each rewrite calls thinking-model (~30-60s).
  await boss.work<ComplianceAutoRewriteJob>(
    JOBS.COMPLIANCE_AUTO_REWRITE,
    async ([job]) => {
      if (!job?.data) return;
      await handleComplianceAutoRewrite(job.data);
    },
  );

  // V1.9 — Batch AI-draft worker. pg-boss v10 dropped teamSize; concurrency
  // comes from batchSize (fetch N jobs per poll) + Promise.all in handler.
  // 5 concurrent LLM calls = safe Doubao Pro QPS water-line.
  await boss.work<BatchDraftItemJob>(
    JOBS.BATCH_DRAFT_ITEM,
    { batchSize: 5 },
    async (jobs) => {
      await Promise.all(
        jobs.map((job) => (job?.data ? handleBatchDraftItem(job.data) : Promise.resolve())),
      );
    },
  );

  // Schedule the daily report at 09:00 Asia/Shanghai (= 01:00 UTC).
  // pg-boss schedule uses UTC cron; 0 1 * * * = 01:00 UTC = 09:00 Asia/Shanghai.
  await boss.schedule(JOBS.REPORTS_DAILY, '0 1 * * *', {});

  // Knowledge-base reconciliation every 5 minutes.
  // Cheap: ~210 md files, hash diff < 200ms; only writes when content changes.
  await boss.schedule(JOBS.KNOWLEDGE_SYNC, '*/5 * * * *', {});

  // Weekly KB report — Mondays 09:00 Asia/Shanghai (= Mon 01:00 UTC).
  await boss.schedule(JOBS.KNOWLEDGE_WEEKLY, '0 1 * * 1', {});

  // Weekly GEO baseline — Mondays 09:00 Asia/Shanghai. Re-runs Doubao on every
  // priority>=7 question for every tenant, gives the customer a fresh SOV
  // snapshot week over week without manual button-mashing.
  await boss.schedule(JOBS.GEO_WEEKLY_BASELINE, '0 1 * * 1', {});

  // Placeholders for later weeks — log receipt so we can verify wiring.
  for (const job of [JOBS.HOOK_PROVISION]) {
    await boss.work(job, async ([msg]) => {
      console.log(`[job:${job}] received`, msg?.id);
    });
  }
}
