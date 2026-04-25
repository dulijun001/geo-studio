/**
 * GEO tracking core — adapter interface and result shapes.
 * Concrete adapters (DoubaoAdapter, YuanbaoAdapter, ...) live under ./adapters/.
 *
 * Design goals:
 *   1. Every engine adapter conforms to the same TrackerAdapter interface.
 *   2. Adapter consumers (the worker) never couple to engine-specific DOM.
 *   3. Each adapter owns its own rate-limit and error classification logic.
 */

export * from './types';
export * from './adapter';
export * from './compliance';
export * from './llm';
export * from './generation';
export * from './dispatch';
