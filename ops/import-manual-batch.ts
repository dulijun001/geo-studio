/**
 * 手工批次导入器 —— 把 ~/Documents/松鼠派单/<日期>/ 下的 md 文章导入系统,
 * 使其满足 dispatchToday 的派单条件,之后即可在后台点「派单」。
 *
 * 背景:2026-08-22 Docker 卡死 + 火山方舟欠费,当日内容走手工产线撰写
 * (见 docs 与 CLAUDE.md D49)。内容已过离线合规扫描(ops/offline-compliance-scan.ts),
 * 因此以「人工审核通过」的状态入库。
 *
 * 用法:
 *   apps/worker/node_modules/.bin/tsx ops/import-manual-batch.ts <批次目录> [--tenant=songshu] [--dry-run]
 * 例:
 *   apps/worker/node_modules/.bin/tsx ops/import-manual-batch.ts ~/Documents/松鼠派单/2026-08-22
 *
 * 幂等:同租户下按 title 查重,已存在则跳过(不覆盖),可安全重复执行。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import postgres from 'postgres';

const PLATFORM = 'toutiao_article';

// dispatchToday 的放行条件:compliance_status ∈ (auto_approved, manual_approved)
// AND dod_status <> 'failed' AND status NOT IN (archived, rejected)。
const VARIANT_COMPLIANCE = 'manual_approved';
const VARIANT_DOD = 'manual_pass';
const VARIANT_STATUS = 'draft';

function parseArgs() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) {
    console.error('用法: tsx ops/import-manual-batch.ts <批次目录> [--tenant=songshu] [--dry-run]');
    process.exit(1);
  }
  const tenantArg = args.find((a) => a.startsWith('--tenant='));
  return {
    dir: resolve(dir.replace(/^~/, process.env.HOME ?? '~')),
    tenantSlug: tenantArg ? tenantArg.split('=')[1] : 'songshu',
    dryRun: args.includes('--dry-run'),
  };
}

type Article = { file: string; title: string; markdown: string; chars: number };

function collect(dir: string): Article[] {
  const files = readdirSync(dir)
    .filter((f) => /^\d{2}-.+\.md$/.test(f) && !f.startsWith('00-'))
    .sort();
  return files.map((f) => {
    const markdown = readFileSync(join(dir, f), 'utf-8');
    const firstLine = markdown.split('\n')[0] ?? '';
    const title = firstLine.replace(/^#\s*/, '').trim();
    if (!title) throw new Error(`${f}: 首行不是 H1 标题,无法解析`);
    return { file: f, title, markdown, chars: markdown.replace(/\s/g, '').length };
  });
}

async function main() {
  const { dir, tenantSlug, dryRun } = parseArgs();
  const batchName = basename(dir);
  const articles = collect(dir);

  console.log(`批次 ${batchName} · ${articles.length} 篇 · 租户 ${tenantSlug}${dryRun ? ' · DRY-RUN' : ''}\n`);
  if (articles.length === 0) {
    console.log('目录下没有找到符合 NN-标题.md 命名的文章,退出。');
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 未设置(用 --env-file=.env 运行,或先 export)');
  const sql = postgres(url, { max: 1, connect_timeout: 10 });

  try {
    const [tenant] = await sql<{ id: string }[]>`
      SELECT id FROM tenants WHERE slug = ${tenantSlug} AND deleted_at IS NULL LIMIT 1`;
    if (!tenant) throw new Error(`找不到租户 slug=${tenantSlug}`);

    let created = 0;
    let skipped = 0;

    for (const a of articles) {
      const [dupe] = await sql<{ id: string }[]>`
        SELECT id FROM content_items
        WHERE tenant_id = ${tenant.id} AND title = ${a.title} AND deleted_at IS NULL
        LIMIT 1`;
      if (dupe) {
        console.log(`⏭  跳过(已存在) ${a.file}`);
        skipped++;
        continue;
      }
      if (dryRun) {
        console.log(`＋ 将导入 ${a.file} · ${a.chars} 字`);
        created++;
        continue;
      }

      // D24:按标题精确匹配题库回填 target_questions。
      // 手工产线的标题就是问题原句(D50),所以能精确命中。不写这个字段的话,
      // 选题 RPC 的 7 天去重靠 target_questions 反查 last_used_at 会完全失效
      // —— cron 会反复选中已经写过的题(D24 正是为此立的)。
      // 匹配不到时留空并出声提示:说明这篇内容没有对应的题库锚点,
      // 追踪引擎也无法为它建快照(geo_snapshots 需要 question_id)。
      const [q] = await sql<{ id: string }[]>`
        SELECT id FROM questions
        WHERE tenant_id = ${tenant.id} AND text = ${a.title} AND deleted_at IS NULL
        LIMIT 1`;
      if (!q) {
        console.log(`   ⚠ 题库中找不到「${a.title}」— target_questions 留空,该篇不进 cron 去重、也不会被追踪`);
      }

      await sql.begin(async (tx) => {
        const [item] = await tx<{ id: string }[]>`
          INSERT INTO content_items
            (tenant_id, title, source_type, markdown, topics, status,
             dod_status, dod_evidence, target_questions)
          VALUES
            (${tenant.id}, ${a.title}, 'manual', ${a.markdown}, ${sql.array([batchName, 'manual-batch'])},
             'variant_generated', ${VARIANT_DOD},
             ${sql.json({ source: 'manual-batch', batch: batchName, note: '手工产线撰写,已过离线合规扫描 ops/offline-compliance-scan.ts' })},
             ${q ? sql`ARRAY[${q.id}::uuid]` : sql`ARRAY[]::uuid[]`})
          RETURNING id`;

        await tx`
          INSERT INTO content_variants
            (tenant_id, content_item_id, platform, title, body,
             compliance_status, status, dod_status, dod_evidence)
          VALUES
            (${tenant.id}, ${item.id}, ${PLATFORM}, ${a.title}, ${a.markdown},
             ${VARIANT_COMPLIANCE}, ${VARIANT_STATUS}, ${VARIANT_DOD},
             ${sql.json({ source: 'manual-batch', batch: batchName, scanner: 'offline pass' })})`;
      });

      console.log(`✔ 导入 ${a.file} · ${a.chars} 字`);
      created++;
    }

    console.log(`\n══ 汇总 ══\n新增 ${created} 篇 · 跳过 ${skipped} 篇`);

    if (!dryRun && created > 0) {
      const [{ count }] = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM content_variants v
        LEFT JOIN publish_tasks pt ON pt.variant_id = v.id AND pt.deleted_at IS NULL
        WHERE v.tenant_id = ${tenant.id}
          AND v.compliance_status IN ('auto_approved','manual_approved')
          AND v.dod_status <> 'failed'
          AND v.status NOT IN ('archived','rejected')
          AND v.deleted_at IS NULL
          AND pt.variant_id IS NULL`;
      console.log(`当前可派单变体总数(含存量): ${count}`);
      console.log(`\n下一步:打开后台 /t/${tenantSlug}/publish 点「派单」。`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error('导入失败:', e instanceof Error ? e.message : e);
  process.exit(1);
});
