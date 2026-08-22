/**
 * 用生产库真实引用源跑引用池测绘,输出运营可读的池子表。
 * 数据用 psql 预先导出为 JSON(geo-core 不依赖 supabase 客户端,保持纯函数包)。
 *
 * Run:
 *   psql "$PGURL" -t -A -c "select coalesce(json_agg(u)::text,'[]') from (select unnest(citation_urls) u from geo_snapshots where deleted_at is null) x;" > /tmp/urls.json
 *   SOURCE_MAP_DIR=/tmp pnpm --filter @geo/geo-core exec tsx src/_dev/source-map-live.ts
 */
import { readFileSync } from 'node:fs';
import { buildSourceMap, capacityMismatch, type SourceBucket } from '../tracking/citation-source-map';

const DIR = process.env.SOURCE_MAP_DIR ?? '/tmp';
const read = (f: string, fallback: string) => {
  try { return JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8').trim() || fallback); }
  catch { return JSON.parse(fallback); }
};

const urls: string[] = read('urls.json', '[]');
const ourIds: string[] = (read('ourids.json', '[]') as (string | null)[]).filter(Boolean) as string[];
const rawCapacity: Record<string, number> = read('capacity.json', '{}');

// 平台 → 池子映射:我方产能落在哪个引用池里
const capacity: Partial<Record<SourceBucket, number>> = {};
for (const [platform, n] of Object.entries(rawCapacity)) {
  const bucket: SourceBucket = platform.startsWith('douyin') ? 'short_video' : 'self_media';
  capacity[bucket] = (capacity[bucket] ?? 0) + n;
}

const map = buildSourceMap({ urls, ourArticleIds: ourIds });
console.log(`引用源 URL 总数 ${map.total}   我方已发布文章 ID ${new Set(ourIds).size} 个\n`);
console.log('池子'.padEnd(16) + '被引'.padEnd(7) + '占比'.padEnd(8) + '我方'.padEnd(6) + '可投放'.padEnd(8) + 'Top 站点');
console.log('─'.repeat(100));
for (const b of map.buckets) {
  const top = b.top_domains.slice(0, 3).map((d) => `${d.domain}(${d.count})`).join('  ');
  console.log(
    b.label.padEnd(18) + String(b.citations).padEnd(7) +
    `${(b.share * 100).toFixed(1)}%`.padEnd(8) + String(b.ours).padEnd(6) +
    (b.actionable ? '是' : '否').padEnd(9) + top,
  );
}
const mm = capacityMismatch({ poolShares: map.buckets, capacityByBucket: capacity });
console.log(`\n我方产能分布: ${JSON.stringify(rawCapacity)}`);
console.log(`产能错配度 ${(mm.score * 100).toFixed(1)}%   (0=完全对齐 100=完全错配,只计可投放池)`);
for (const d of mm.details.sort((a, b) => b.pool - a.pool)) {
  const gap = d.pool - d.capacity;
  console.log(`  ${d.bucket.padEnd(17)} 引用池 ${(d.pool * 100).toFixed(1).padStart(5)}%   产能 ${(d.capacity * 100).toFixed(1).padStart(5)}%   缺口 ${(gap * 100).toFixed(1).padStart(6)}pp`);
}
if (map.unknown_samples.length) {
  console.log(`\n未归类域名 top(应定期补进规则表):`);
  for (const u of map.unknown_samples.slice(0, 10)) console.log(`  ${u.domain.padEnd(28)} ${u.count}`);
}
