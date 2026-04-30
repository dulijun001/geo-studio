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
      { id: 's1', persona_tags: ['种植牙'], platforms: ['toutiao_article'], tasks_today: 0 },
      // Can do douyin
      { id: 's2', persona_tags: ['正畸'], platforms: ['douyin_script'], tasks_today: 0 },
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
      { id: 's1', persona_tags: ['种植牙'], platforms: ['xiaohongshu'], tasks_today: 2 },
      // Fresh; should get 2, then third unmatched
      { id: 's2', persona_tags: ['种植牙'], platforms: ['xiaohongshu'], tasks_today: 0 },
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
      { id: 's1', persona_tags: ['种植牙'], platforms: ['xiaohongshu'], tasks_today: 0 },
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
      },
      // Great match
      {
        id: 's2',
        persona_tags: ['儿牙', '涂氟', '窝沟封闭'],
        platforms: ['xiaohongshu'],
        tasks_today: 0,
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
      { id: 's1', persona_tags: [], platforms: ['xiaohongshu'], tasks_today: 0 },
      { id: 's2', persona_tags: [], platforms: ['xiaohongshu'], tasks_today: 0 },
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
      { id: 's1', persona_tags: [], platforms: ['xiaohongshu'], tasks_today: 0 },
      { id: 's2', persona_tags: [], platforms: ['xiaohongshu'], tasks_today: 0 },
      { id: 's3', persona_tags: [], platforms: ['xiaohongshu'], tasks_today: 0 },
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

console.log('');
console.log('all dispatch tests passed ✓');
