import type PgBoss from 'pg-boss';
import { handleBatchDraftItem, type BatchDraftItemJob } from './batch-draft-item';
import {
  handleComplianceAutoRewrite,
  type ComplianceAutoRewriteJob,
} from './compliance-auto-rewrite';
import { handleComplianceReview, type ComplianceReviewJob } from './compliance-review';
import { handleDailyReport, type DailyReportJob } from './daily-report';
import { handleAutoDispatchTimeout, AUTO_DISPATCH_TIMEOUT_JOB } from './auto-dispatch-timeout';
import { handleNightlyDraft, NIGHTLY_DRAFT_JOB } from './nightly-draft';
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
import { handleStaffBacklogDigest, STAFF_BACKLOG_DIGEST_JOB } from './staff-backlog-digest';
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
  DAILY_OPS_NIGHTLY_DRAFT: NIGHTLY_DRAFT_JOB, // V1.10 docs/09 cron #1
  DAILY_OPS_AUTO_DISPATCH_TIMEOUT: AUTO_DISPATCH_TIMEOUT_JOB, // V1.10 docs/09 cron #2
  STAFF_BACKLOG_DIGEST: STAFF_BACKLOG_DIGEST_JOB, // G1 轻量版 — 每日待发积压推企微
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

  // 变体生成并发默认 1(与原行为一致)。2026-09-14:备用通道(claudeproxy)单篇 5-8 min,
  // 10 篇串行要 2h;欠费期间 .env 设 VARIANT_CONCURRENCY=3 并行压到 ~45 min,Ark 恢复后可删。
  const variantConcurrency = Math.max(1, Number(process.env.VARIANT_CONCURRENCY) || 1);
  console.log(`[worker] variant_generate concurrency=${variantConcurrency}`);
  await boss.work<VariantGenerateJob>(
    JOBS.VARIANT_GENERATE,
    { batchSize: variantConcurrency },
    async (jobs) => {
      await Promise.all(
        jobs.map((job) => (job?.data ? handleVariantGenerate(job.data) : Promise.resolve())),
      );
    },
  );

  await boss.work<GeoSnapshotJob>(JOBS.GEO_SNAPSHOT, async ([job]) => {
    if (!job?.data) return;
    await handleGeoSnapshot(job.data);
  });

  await boss.work<DailyReportJob>(JOBS.REPORTS_DAILY, async ([job]) => {
    await handleDailyReport(job?.data ?? {});
  });

  await boss.work(JOBS.STAFF_BACKLOG_DIGEST, async () => {
    await handleStaffBacklogDigest();
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
  // 2026-09-11: 并发改 env 可配。Ark 欠费切备用通道(本机 claudeproxy)时,备用通道
  // 是排队不是并行 —— 实测单篇长文 63s,5 并发排队后必超时,14/14 全灭。
  // 欠费期间在 .env 设 DRAFT_CONCURRENCY=2,Ark 恢复后删掉即回到 5。
  const draftConcurrency = Math.max(1, Number(process.env.DRAFT_CONCURRENCY) || 5);
  console.log(`[worker] batch_draft_item concurrency=${draftConcurrency}`);
  await boss.work<BatchDraftItemJob>(
    JOBS.BATCH_DRAFT_ITEM,
    { batchSize: draftConcurrency },
    async (jobs) => {
      await Promise.all(
        jobs.map((job) => (job?.data ? handleBatchDraftItem(job.data) : Promise.resolve())),
      );
    },
  );

  // Schedule the daily report at 09:00 Asia/Shanghai (= 01:00 UTC).
  // pg-boss schedule uses UTC cron; 0 1 * * * = 01:00 UTC = 09:00 Asia/Shanghai.
  await boss.schedule(JOBS.REPORTS_DAILY, '0 1 * * *', {});

  // G1 轻量版 — 每日 04:00 UTC = 12:00 Asia/Shanghai,午间把待发积压推管理员企微。
  await boss.schedule(JOBS.STAFF_BACKLOG_DIGEST, '0 4 * * *', {});

  // Knowledge-base reconciliation every 5 minutes.
  // Cheap: ~210 md files, hash diff < 200ms; only writes when content changes.
  await boss.schedule(JOBS.KNOWLEDGE_SYNC, '*/5 * * * *', {});

  // Weekly KB report — Mondays 09:00 Asia/Shanghai (= Mon 01:00 UTC).
  await boss.schedule(JOBS.KNOWLEDGE_WEEKLY, '0 1 * * 1', {});

  // Weekly GEO baseline — Mondays 09:00 Asia/Shanghai. Re-runs Doubao on every
  // priority>=7 question for every tenant, gives the customer a fresh SOV
  // snapshot week over week without manual button-mashing.
  await boss.schedule(JOBS.GEO_WEEKLY_BASELINE, '0 1 * * 1', {});

  // V1.10 docs/09 cron #1 — Nightly daily-ops draft trigger.
  // 18:00 UTC = 02:00 Asia/Shanghai (next day). Per-tenant settings.run_cron
  // can override (but pg-boss schedule is global; per-tenant cron is V1.11+).
  // For V1.10 all enabled tenants share the global 02:00 CST trigger.
  await boss.work(JOBS.DAILY_OPS_NIGHTLY_DRAFT, async () => {
    await handleNightlyDraft();
  });
  await boss.schedule(JOBS.DAILY_OPS_NIGHTLY_DRAFT, '0 18 * * *', {});

  // V1.10 docs/09 cron #2 — Auto-dispatch timeout poller.
  // Every 30 min: advances runs from drafting→awaiting_review (when batch
  // is done) and awaiting_review→auto_dispatched_partial (after timeout_hours).
  // Cheap: SELECT on small daily_ops_runs table, only acts on stuck runs.
  await boss.work(JOBS.DAILY_OPS_AUTO_DISPATCH_TIMEOUT, async () => {
    await handleAutoDispatchTimeout();
  });
  await boss.schedule(JOBS.DAILY_OPS_AUTO_DISPATCH_TIMEOUT, '*/30 * * * *', {});

  // Placeholders for later weeks — log receipt so we can verify wiring.
  for (const job of [JOBS.HOOK_PROVISION]) {
    await boss.work(job, async ([msg]) => {
      console.log(`[job:${job}] received`, msg?.id);
    });
  }
}
