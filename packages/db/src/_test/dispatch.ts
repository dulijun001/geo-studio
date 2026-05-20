/**
 * Smoke test for the W5 dispatch algorithm.
 * Runs in-memory (no DB) — verifies hard constraints and tie-breaking.
 */

import { dispatchDaily, type DispatchInput } from '@geo/geo-core';

function assertEq<T>(label: string, actual: T, expected: T): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(`✗ ${label}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

function assertTrue(label: string, cond: boolean): void {
  if (!cond) {
    console.error(`✗ ${label}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

// ---- Test 1: platform capability filters ---------------------------------
{
  const input: DispatchInput = {
    variants: [
      { id: 'v1', platform: 'douyin_script', topics: ['种植牙'], ready_at: new Date() },
    ],
    staff: [
      // Can't do douyin
      { id: 's1', persona_tags: ['种植牙'], platforms: ['toutiao_article'], tasks_today: 0, is_active: true },
      // Can do douyin
      { id: 's2', persona_tags: ['正畸'], platforms: ['douyin_script'], tasks_today: 0, is_active: true },
    ],
    existing_assignments: [],
    daily_cap_per_staff: 2,
    seed: '2026-04-24',
  };
  const r = dispatchDaily(input);
  assertEq('T1 platform filter assigns to capable staff', r.proposals[0]?.staff_id, 's2');
}

// ---- Test 2: daily cap enforced (including pre-existing) -----------------
{
  const input: DispatchInput = {
    variants: [
      { id: 'v1', platform: 'xiaohongshu', topics: ['种植牙'], ready_at: new Date() },
      { id: 'v2', platform: 'xiaohongshu', topics: ['种植牙'], ready_at: new Date() },
      { id: 'v3', platform: 'xiaohongshu', topics: ['种植牙'], ready_at: new Date() },
    ],
    staff: [
      // Already at cap (2); must not receive any
      { id: 's1', persona_tags: ['种植牙'], platforms: ['xiaohongshu'], tasks_today: 2, is_active: true },
      // Fresh; should get 2, then third unmatched
      { id: 's2', persona_tags: ['种植牙'], platforms: ['xiaohongshu'], tasks_today: 0, is_active: true },
    ],
    existing_assignments: [],
    daily_cap_per_staff: 2,
    seed: '2026-04-24',
  };
  const r = dispatchDaily(input);
  const s2Count = r.proposals.filter((p) => p.staff_id === 's2').length;
  const s1Count = r.proposals.filter((p) => p.staff_id === 's1').length;
  assertEq('T2 s1 over cap receives 0', s1Count, 0);
  assertEq('T2 s2 receives daily cap of 2', s2Count, 2);
  assertEq('T2 third variant unmatched', r.unmatched.length, 1);
}

// ---- Test 3: anti-collision (same variant not twice in a day) ------------
{
  const input: DispatchInput = {
    variants: [
      { id: 'v1', platform: 'xiaohongshu', topics: ['种植牙'], ready_at: new Date() },
    ],
    staff: [
      { id: 's1', persona_tags: ['种植牙'], platforms: ['xiaohongshu'], tasks_today: 0, is_active: true },
    ],
    existing_assignments: [{ variant_id: 'v1', staff_id: 's2' }], // already given out
    daily_cap_per_staff: 2,
    seed: '2026-04-24',
  };
  const r = dispatchDaily(input);
  assertEq('T3 already-assigned variant skipped', r.proposals.length, 0);
}

// ---- Test 4: persona matching prefers high Jaccard -----------------------
{
  const input: DispatchInput = {
    variants: [
      { id: 'v1', platform: 'xiaohongshu', topics: ['儿牙', '涂氟'], ready_at: new Date() },
    ],
    staff: [
      // Bad match
      {
        id: 's1',
        persona_tags: ['种植牙', '正畸'],
        platforms: ['xiaohongshu'],
        tasks_today: 0,
        is_active: true,
      },
      // Great match
      {
        id: 's2',
        persona_tags: ['儿牙', '涂氟', '窝沟封闭'],
        platforms: ['xiaohongshu'],
        tasks_today: 0,
        is_active: true,
      },
    ],
    existing_assignments: [],
    daily_cap_per_staff: 2,
    seed: '2026-04-24',
  };
  const r = dispatchDaily(input);
  assertEq('T4 persona match picks s2', r.proposals[0]?.staff_id, 's2');
  assertTrue('T4 match score > 0', (r.proposals[0]?.match_score ?? 0) > 0);
}

// ---- Test 5: time window split (first half morning, second half afternoon) ----
{
  const input: DispatchInput = {
    variants: Array.from({ length: 4 }, (_, i) => ({
      id: `v${i + 1}`,
      platform: 'xiaohongshu',
      topics: [],
      ready_at: new Date(),
    })),
    staff: [
      { id: 's1', persona_tags: [], platforms: ['xiaohongshu'], tasks_today: 0, is_active: true },
      { id: 's2', persona_tags: [], platforms: ['xiaohongshu'], tasks_today: 0, is_active: true },
    ],
    existing_assignments: [],
    daily_cap_per_staff: 2,
    seed: '2026-04-24',
  };
  const r = dispatchDaily(input);
  const morning = r.proposals.filter((p) => p.time_window === 'morning').length;
  const afternoon = r.proposals.filter((p) => p.time_window === 'afternoon').length;
  assertTrue('T5 has morning slots', morning >= 1);
  assertTrue('T5 has afternoon slots', afternoon >= 1);
  assertEq('T5 total matches cap', morning + afternoon, 4);
}

// ---- Test 6: deterministic with same seed --------------------------------
{
  const mkInput = (): DispatchInput => ({
    variants: Array.from({ length: 3 }, (_, i) => ({
      id: `v${i + 1}`,
      platform: 'xiaohongshu',
      topics: [],
      ready_at: new Date('2026-04-24T10:00:00Z'),
    })),
    staff: [
      { id: 's1', persona_tags: [], platforms: ['xiaohongshu'], tasks_today: 0, is_active: true },
      { id: 's2', persona_tags: [], platforms: ['xiaohongshu'], tasks_today: 0, is_active: true },
      { id: 's3', persona_tags: [], platforms: ['xiaohongshu'], tasks_today: 0, is_active: true },
    ],
    existing_assignments: [],
    daily_cap_per_staff: 2,
    seed: '2026-04-24',
  });
  const a = dispatchDaily(mkInput());
  const b = dispatchDaily(mkInput());
  assertEq(
    'T6 same seed → same assignment order',
    a.proposals.map((p) => `${p.variant_id}→${p.staff_id}`),
    b.proposals.map((p) => `${p.variant_id}→${p.staff_id}`),
  );
}

// ---- Test 7: V1.11 H0 inactive staff are skipped --------------------------
{
  const input: DispatchInput = {
    variants: [
      { id: 'v1', platform: 'xiaohongshu', topics: ['种植牙'], ready_at: new Date() },
      { id: 'v2', platform: 'xiaohongshu', topics: ['种植牙'], ready_at: new Date() },
    ],
    staff: [
      // Inactive — should never be picked even though persona + platform fit.
      { id: 's1', persona_tags: ['种植牙'], platforms: ['xiaohongshu'], tasks_today: 0, is_active: false },
      // Active — should pick up both variants.
      { id: 's2', persona_tags: ['种植牙'], platforms: ['xiaohongshu'], tasks_today: 0, is_active: true },
    ],
    existing_assignments: [],
    daily_cap_per_staff: 2,
    seed: '2026-05-20',
  };
  const r = dispatchDaily(input);
  const s1Count = r.proposals.filter((p) => p.staff_id === 's1').length;
  const s2Count = r.proposals.filter((p) => p.staff_id === 's2').length;
  assertEq('T7 inactive s1 receives 0', s1Count, 0);
  assertEq('T7 active s2 receives 2', s2Count, 2);
}

// ---- Test 8: V1.11 per-staff daily_quota override -------------------------
{
  const input: DispatchInput = {
    variants: Array.from({ length: 4 }, (_, i) => ({
      id: `v${i + 1}`,
      platform: 'xiaohongshu',
      topics: [],
      ready_at: new Date(),
    })),
    staff: [
      // Per-staff override: 1 (overrides global cap of 5)
      { id: 's1', persona_tags: [], platforms: ['xiaohongshu'], tasks_today: 0, is_active: true, daily_quota: 1 },
      // No override → uses global cap (5)
      { id: 's2', persona_tags: [], platforms: ['xiaohongshu'], tasks_today: 0, is_active: true },
    ],
    existing_assignments: [],
    daily_cap_per_staff: 5,
    seed: '2026-05-20',
  };
  const r = dispatchDaily(input);
  const s1Count = r.proposals.filter((p) => p.staff_id === 's1').length;
  assertEq('T8 per-staff quota=1 limits s1 to 1 task', s1Count, 1);
}

// ---- Test 9b: V1.11 F1 substring fallback (real production topic shape) --
// Real production: runAiDraft writes content_items.topics = [topic_sentence, audience],
// not clean tags. Pure Jaccard misses because no exact overlap. F1 substring
// rescues it.
{
  const input: DispatchInput = {
    variants: [
      // Real topic shape from runAiDraft (apps/web/lib/ai-draft-core.ts:875)
      { id: 'v1', platform: 'xiaohongshu', topics: ['种植牙 5 年存活率', '60-75 岁缺牙人群'], ready_at: new Date() },
    ],
    staff: [
      // Implant doctor — "种植牙知识" appears as substring of variant topic.
      { id: 'implant', persona_tags: ['种植牙知识', '复杂植骨'], platforms: ['xiaohongshu'], tasks_today: 0, is_active: true },
      // Pediatric — no substring overlap.
      { id: 'pedo', persona_tags: ['儿牙科普', '涂氟科普'], platforms: ['xiaohongshu'], tasks_today: 0, is_active: true },
    ],
    existing_assignments: [],
    daily_cap_per_staff: 2,
    seed: '2026-05-20',
  };
  const r = dispatchDaily(input);
  assertEq('T9b F1 substring picks implant doctor for 种植牙 topic', r.proposals[0]?.staff_id, 'implant');
  assertTrue('T9b match score > 0 (substring)', (r.proposals[0]?.match_score ?? 0) > 0);
}

// ---- Test 9: V1.11 all-inactive → all variants unmatched ------------------
{
  const input: DispatchInput = {
    variants: [
      { id: 'v1', platform: 'xiaohongshu', topics: [], ready_at: new Date() },
    ],
    staff: [
      { id: 's1', persona_tags: [], platforms: ['xiaohongshu'], tasks_today: 0, is_active: false },
    ],
    existing_assignments: [],
    daily_cap_per_staff: 2,
    seed: '2026-05-20',
  };
  const r = dispatchDaily(input);
  assertEq('T9 no active staff → unmatched', r.unmatched.length, 1);
  assertTrue(
    'T9 diagnose mentions active publisher',
    r.unmatched[0]?.reason.includes('active publisher') ?? false,
  );
}

console.log('');
console.log('all dispatch tests passed ✓');
