import { Client } from 'pg';

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  await client.connect();

  // 查看历史快照中，那些不带西山区的泛词问答到底是什么表现
  const res = await client.query(`
    select 
      q.query_text,
      s.engine,
      s.created_at,
      s.raw_response,
      array_agg(distinct c.brand_name) filter (where c.brand_name is not null) as mentioned_brands
    from geo_snapshots s
    join questions q on s.question_id = q.id
    left join citations c on s.id = c.snapshot_id
    where q.query_text not like '%西山%'
      and (q.query_text like '%种植牙%' or q.query_text like '%正畸%' or q.query_text like '%矫正%')
    group by q.query_text, s.engine, s.created_at, s.raw_response
    order by s.created_at desc
    limit 10;
  `);

  console.log(`查到 ${res.rows.length} 条不带“西山区”的历史泛词快照:`);
  for (const r of res.rows) {
    console.log(`\n--------------------------------------------`);
    console.log(`[题目]: ${r.query_text}`);
    console.log(`[引擎]: ${r.engine} | [时间]: ${r.created_at}`);
    console.log(`[提及品牌]: ${JSON.stringify(r.mentioned_brands)}`);
    console.log(`[回答摘要]: ${r.raw_response?.slice(0, 250).replace(/\n/g, ' ')}...`);
  }

  await client.end();
}

main().catch(console.error);
