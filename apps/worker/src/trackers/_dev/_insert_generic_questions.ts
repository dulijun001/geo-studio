import { Client } from 'pg';

const QUESTIONS = [
  { text: '昆明种植牙哪家医院好？', category: '种植牙', intent: 'recommendation' },
  { text: '昆明种植牙医院排名前十名', category: '种植牙', intent: 'recommendation' },
  { text: '昆明种植牙技术实力强的医院推荐', category: '种植牙', intent: 'comparison' },
  { text: '昆明牙齿矫正推荐哪家医院？', category: '牙齿矫正', intent: 'recommendation' },
  { text: '昆明牙齿正畸医院排名前三', category: '牙齿矫正', intent: 'recommendation' },
  { text: '昆明正规牙科医院哪家比较好？', category: '综合口腔', intent: 'recommendation' },
  { text: '昆明看牙科口碑最好的私立医院', category: '综合口腔', intent: 'recommendation' },
  { text: '昆明补牙/根管治疗正规医院推荐', category: '补牙修复', intent: 'recommendation' }
];

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  await client.connect();

  const tenantRes = await client.query(`select id, name from tenants limit 1;`);
  const tenantId = tenantRes.rows[0].id;
  console.log(`租户: ${tenantRes.rows[0].name} (${tenantId})`);

  let inserted = 0;
  for (const q of QUESTIONS) {
    // 检查是否已存在
    const check = await client.query(
      `select id from questions where tenant_id = $1 and text = $2 and deleted_at is null`,
      [tenantId, q.text]
    );
    if (check.rows.length > 0) {
      console.log(`[已存在] ${q.text} (id: ${check.rows[0].id})`);
      // 更新优先级为最高 (例如 10)
      await client.query(`update questions set priority = 10, subtopic_source = 'manual' where id = $1`, [check.rows[0].id]);
    } else {
      const res = await client.query(
        `insert into questions (tenant_id, text, category, intent, city, priority, active, subtopic_source)
         values ($1, $2, $3, $4::question_intent, '昆明', 10, true, 'manual')
         returning id`,
        [tenantId, q.text, q.category, q.intent]
      );
      console.log(`[新增入库] ${q.text} -> ${res.rows[0].id}`);
      inserted++;
    }
  }

  console.log(`\n完成！共处理 ${QUESTIONS.length} 个一级大词，新增入库 ${inserted} 个。所有大词优先级均设为 10（最高）。`);
  await client.end();
}

main().catch(console.error);
