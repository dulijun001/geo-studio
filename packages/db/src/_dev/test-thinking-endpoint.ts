/**
 * One-off verification that ARK_MODEL_THINKING resolves + chat() returns
 * a successful response with the expected model name.
 *
 * Run: pnpm --filter @geo/db exec tsx --env-file=../../.env src/_dev/test-thinking-endpoint.ts
 *
 * Cost: ~ 1 LLM call (≤ 200 output tokens) — pennies.
 */
import { chat } from '@geo/geo-core';

async function main() {
  const endpoint = process.env.ARK_MODEL_THINKING;
  console.log('ARK_MODEL_THINKING env =', endpoint ?? '(unset)');
  if (!endpoint) {
    console.error('ARK_MODEL_THINKING not set in .env');
    process.exit(1);
  }

  const t0 = Date.now();
  const result = await chat({
    messages: [
      { role: 'system', content: '你简短回答,不要思考过程。' },
      {
        role: 'user',
        content: '说"thinking 接入点工作正常",不加其他字。',
      },
    ],
    model: endpoint,
    temperature: 0,
    max_tokens: 200,
    timeout_ms: 60_000,
  });
  const elapsed = Date.now() - t0;

  console.log('');
  console.log('=== Response ===');
  console.log('content:', result.content);
  console.log('model:', (result as { model?: string }).model ?? '(missing)');
  const usage = (result as { usage?: Record<string, number> }).usage;
  if (usage) {
    console.log('tokens.prompt:', usage.prompt_tokens);
    console.log('tokens.completion:', usage.completion_tokens);
    console.log('tokens.total:', usage.total_tokens);
  }
  console.log('elapsed:', elapsed + 'ms');
  console.log('');
  console.log('✓ thinking endpoint reachable');
}

main().catch((err) => {
  console.error('✗ FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
