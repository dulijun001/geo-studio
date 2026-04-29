/**
 * Engine → adapter dispatch table.
 *
 * geo-snapshot.ts looks up an adapter here; adding a new engine is just
 * implementing the TrackerAdapter contract and registering it. Static
 * map at module load — no side-effect imports needed.
 *
 * Implementation status (2026-04-29):
 *   doubao    ✅ live, login + cookie persistence working, tested
 *   yuanbao   🟡 scaffolded, login command shipped — first run may need
 *             selector tuning via `pnpm yuanbao:probe`
 *   quark     ⚪ stub (阿里夸克)
 *   deepseek  ⚪ stub (chat.deepseek.com)
 *   wenxin    ⚪ stub (百度文心一言;yiyan.baidu.com)
 *   kimi      ⚪ stub (kimi.com)
 *   qwen      ⚪ stub (chat.qwen.ai)
 *   chatgpt    ⚪ stub (mostly outside the GFW)
 *   perplexity ⚪ stub
 *
 * stub() returns "not implemented" failure distinct from a transport /
 * login failure, so the UI can show "扩展中" instead of red.
 */
import type { TrackerAdapter } from '@geo/geo-core';
import type { Engine } from '@geo/shared';
import { doubaoWebAdapter } from './doubao-web';
import { yuanbaoWebAdapter } from './yuanbao-web';

function makeStub(engine: Engine): TrackerAdapter {
  return {
    engine,
    async query() {
      return {
        status: 'failed',
        failure_reason: `engine=${engine} adapter not implemented yet — see apps/worker/src/trackers/registry.ts`,
        meta: { elapsed_ms: 0 },
      };
    },
  };
}

const REGISTRY: Record<Engine, TrackerAdapter> = {
  doubao: doubaoWebAdapter,
  yuanbao: yuanbaoWebAdapter,
  quark: makeStub('quark'),
  deepseek: makeStub('deepseek'),
  wenxin: makeStub('wenxin'),
  kimi: makeStub('kimi'),
  qwen: makeStub('qwen'),
  chatgpt: makeStub('chatgpt'),
  perplexity: makeStub('perplexity'),
};

const IMPLEMENTED: Engine[] = ['doubao', 'yuanbao'];

/**
 * Manual registration kept for back-compat with any code that still calls
 * registerAdapter() — it overwrites the static entry. Anything new should
 * just import from REGISTRY.
 */
export function registerAdapter(adapter: TrackerAdapter): void {
  (REGISTRY as Record<Engine, TrackerAdapter>)[adapter.engine] = adapter;
}

export function getAdapter(engine: Engine): TrackerAdapter {
  const adapter = REGISTRY[engine];
  if (!adapter) throw new Error(`No adapter registered for engine: ${engine}`);
  return adapter;
}

export function listAdapters(): Engine[] {
  return Object.keys(REGISTRY) as Engine[];
}

/** Engines that have a real (non-stub) implementation. */
export function listImplementedEngines(): Engine[] {
  return [...IMPLEMENTED];
}

export function isImplemented(engine: Engine): boolean {
  return IMPLEMENTED.includes(engine);
}
