import type { TrackerAdapter } from '@geo/geo-core';
import type { Engine } from '@geo/shared';

/**
 * Runtime registry mapping engine => adapter implementation.
 * V1 Week 6 wires the Doubao adapter; Week 9+ extends to others.
 */
const registry = new Map<Engine, TrackerAdapter>();

export function registerAdapter(adapter: TrackerAdapter): void {
  registry.set(adapter.engine, adapter);
}

export function getAdapter(engine: Engine): TrackerAdapter {
  const adapter = registry.get(engine);
  if (!adapter) throw new Error(`No adapter registered for engine: ${engine}`);
  return adapter;
}

export function listAdapters(): Engine[] {
  return [...registry.keys()];
}
