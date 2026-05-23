/**
 * V1.12 D31 合规单测:确保 SYSTEM_PROMPT 把"竞品 mention"
 * 写进了禁令(不依赖网络调 LLM,只检 prompt 包含必要约束)。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'tracking', 'expand-subtopics.ts'), 'utf8');

function assert(label: string, cond: boolean): void {
  if (!cond) {
    console.error(`✗ ${label}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

assert('SYSTEM_PROMPT contains competitor ban', /禁止任何 mention 具体竞品/.test(source));
assert('SYSTEM_PROMPT contains absolute-words ban', /禁止绝对化用语/.test(source));
assert('SYSTEM_PROMPT contains efficacy claim ban', /禁止疗效承诺/.test(source));
assert('SYSTEM_PROMPT contains disparagement ban', /禁止贬低同行/.test(source));
assert('SYSTEM_PROMPT bans comparison-by-name', /绝不.+具体机构/.test(source));
assert('SYSTEM_PROMPT requires JSON output without fence', /严格 JSON/.test(source));

console.log('\nall expand-subtopics compliance assertions passed ✓');
