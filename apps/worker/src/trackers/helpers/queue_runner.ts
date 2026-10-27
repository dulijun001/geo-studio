/**
 * 工业级长效任务调度器 (Robust Anti-Detection Task Queue)
 *
 * 核心特性:
 * 1. 单流阶梯推进，坚决杜绝多并发轰炸
 * 2. 拟人化随机退避与休眠 (Jitter Sleep 15s~35s)
 * 3. 智能健康度探测与熔断机制 (Circuit Breaker)
 * 4. 实时物理落库 (geo_snapshots) 与进度持久化
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sleep, randomInt } from './human.js';
import { deepseekWebAdapter } from '../deepseek-web.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase 环境变量未配置');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface BenchmarkItem {
  id: string;
  tenant_id: string;
  query_text: string;
}

export interface QueueOptions {
  batchFile: string;
  stateFile?: string;
  minDelaySec?: number;
  maxDelaySec?: number;
  maxConsecutiveFails?: number;
  headless?: boolean;
}

export class RobustTaskRunner {
  private batch: BenchmarkItem[] = [];
  private completedIds: Set<string> = new Set();
  private stateFilePath: string;
  private consecutiveFails = 0;

  constructor(private opts: QueueOptions) {
    this.stateFilePath = opts.stateFile || resolve(process.cwd(), 'task_queue_state.json');
    this.loadTasks();
  }

  private loadTasks() {
    const raw = readFileSync(this.opts.batchFile, 'utf-8');
    this.batch = JSON.parse(raw);

    if (existsSync(this.stateFilePath)) {
      try {
        const saved = JSON.parse(readFileSync(this.stateFilePath, 'utf-8'));
        if (Array.isArray(saved.completed)) {
          this.completedIds = new Set(saved.completed);
        }
      } catch {
        // ignore state parse error
      }
    }
  }

  private saveState() {
    writeFileSync(
      this.stateFilePath,
      JSON.stringify(
        {
          updated_at: new Date().toISOString(),
          total: this.batch.length,
          completed_count: this.completedIds.size,
          completed: Array.from(this.completedIds),
        },
        null,
        2
      )
    );
  }

  public async run(): Promise<void> {
    const minDelay = (this.opts.minDelaySec ?? 15) * 1000;
    const maxDelay = (this.opts.maxDelaySec ?? 30) * 1000;
    const maxFails = this.opts.maxConsecutiveFails ?? 3;

    console.log(`\n======================================================`);
    console.log(`🚀 启动长效防风控抓取引擎 (WebAI2API 拟人化架构)`);
    console.log(`📦 总任务池: ${this.batch.length} 题 | 已完成: ${this.completedIds.size} 题`);
    console.log(`⏳ 拟人间歇: ${minDelay / 1000}s ~ ${maxDelay / 1000}s (随机抖动)`);
    console.log(`======================================================\n`);

    for (let i = 0; i < this.batch.length; i++) {
      const item = this.batch[i]!;
      if (this.completedIds.has(item.id)) {
        continue;
      }

      console.log(`\n▶ [${i + 1}/${this.batch.length}] 正在执行: "${item.query_text}" (ID: ${item.id})`);

      try {
        const result = await deepseekWebAdapter.query(
          {
            engine: 'deepseek',
            question: item.query_text,
          },
          {
            tenant_id: item.tenant_id,
            headless: this.opts.headless ?? true,
            timeout_ms: 60_000,
          }
        );

        if (result.status === 'done') {
          this.consecutiveFails = 0;
          console.log(`   ✅ 抓取成功 | 字符数: ${result.raw_response.length} | 引用: ${result.citation_urls.length} 条`);

          // 物理写库
          const { error } = await supabase.from('geo_snapshots').insert({
            tenant_id: item.tenant_id,
            question_id: item.id,
            engine: 'deepseek',
            raw_response: result.raw_response,
            citation_urls: result.citation_urls,
            captured_at: new Date().toISOString(),
          });

          if (error) {
            console.error(`   ⚠️ 数据库写入警告: ${error.message}`);
          } else {
            console.log(`   💾 物理快照已写入 geo_snapshots`);
          }

          this.completedIds.add(item.id);
          this.saveState();
        } else {
          this.consecutiveFails++;
          console.warn(`   ❌ 抓取失败: ${result.failure_reason}`);
        }
      } catch (err) {
        this.consecutiveFails++;
        console.error(`   💥 异常错误: ${err instanceof Error ? err.message : String(err)}`);
      }

      // 触发风控熔断保护
      if (this.consecutiveFails >= maxFails) {
        console.error(`\n🚨 连续失败已达 ${maxFails} 次！触发防风控主动熔断保护，暂停调度以保护账号与环境安全。`);
        break;
      }

      // 拟人化阅读与思考间隔
      const waitTime = randomInt(minDelay, maxDelay);
      console.log(`   💤 模拟真人浏览间歇，随机休眠 ${(waitTime / 1000).toFixed(1)} 秒...`);
      await sleep(waitTime);
    }

    console.log(`\n🎉 批次处理结束，已安全完成 ${this.completedIds.size} / ${this.batch.length} 条任务。`);
  }
}
