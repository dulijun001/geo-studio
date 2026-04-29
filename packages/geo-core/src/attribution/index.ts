/**
 * Multi-touch attribution models for customer journeys.
 *
 * Input: ordered list of touchpoints + a conversion event.
 * Output: per-touchpoint credit (sums to 1.0).
 *
 * Three classic models so the operator can sanity-check against each other:
 *
 *   linear         every touchpoint gets equal share. Simple baseline.
 *   time_decay     exponential decay toward the conversion. Good when
 *                  recency matters most (fashion, holiday promos).
 *                  Half-life = 7 days by default.
 *   position_based 40% to first touchpoint (introduced the brand) +
 *                  40% to last (closed the deal) + 20% split among
 *                  middle touchpoints. The U-curve commonly cited in
 *                  Google Analytics literature.
 *
 * For a single touchpoint, all three collapse to credit = 1.0.
 * For two touchpoints, linear=0.5/0.5, time_decay biased to last,
 * position_based = 0.5/0.5 (first+last only).
 */

export type Touchpoint = {
  id: string;
  publish_task_id: string | null;
  touched_at: Date;
};

export type AttributionCredit = {
  touchpoint_id: string;
  publish_task_id: string | null;
  credit: number; // 0..1
};

export type AttributionResult = {
  model: AttributionModel;
  total_touchpoints: number;
  credits: AttributionCredit[];
};

export type AttributionModel = 'linear' | 'time_decay' | 'position_based';

export const TIME_DECAY_HALF_LIFE_DAYS = 7;

export function attribute(
  touchpoints: Touchpoint[],
  conversionAt: Date,
  model: AttributionModel,
): AttributionResult {
  // Always sort by time ascending so model logic is unambiguous.
  const sorted = [...touchpoints].sort((a, b) => a.touched_at.getTime() - b.touched_at.getTime());
  const n = sorted.length;
  if (n === 0) {
    return { model, total_touchpoints: 0, credits: [] };
  }
  if (n === 1) {
    return {
      model,
      total_touchpoints: 1,
      credits: [{ touchpoint_id: sorted[0]!.id, publish_task_id: sorted[0]!.publish_task_id, credit: 1 }],
    };
  }

  let weights: number[];
  switch (model) {
    case 'linear':
      weights = new Array(n).fill(1 / n);
      break;
    case 'time_decay': {
      // weight = 0.5 ^ (days_to_conversion / half_life)
      // touchpoints closer to conversion get exponentially more credit.
      const halfLifeMs = TIME_DECAY_HALF_LIFE_DAYS * 86_400_000;
      const raw = sorted.map((t) => {
        const dt = Math.max(0, conversionAt.getTime() - t.touched_at.getTime());
        return Math.pow(0.5, dt / halfLifeMs);
      });
      const sum = raw.reduce((a, b) => a + b, 0);
      weights = sum > 0 ? raw.map((w) => w / sum) : new Array(n).fill(1 / n);
      break;
    }
    case 'position_based': {
      // First 40%, last 40%, middle 20% split equally.
      if (n === 2) {
        weights = [0.5, 0.5];
      } else {
        const middleCount = n - 2;
        const middleEach = 0.2 / middleCount;
        weights = sorted.map((_, i) => {
          if (i === 0) return 0.4;
          if (i === n - 1) return 0.4;
          return middleEach;
        });
      }
      break;
    }
  }

  return {
    model,
    total_touchpoints: n,
    credits: sorted.map((t, i) => ({
      touchpoint_id: t.id,
      publish_task_id: t.publish_task_id,
      credit: Number(weights[i]!.toFixed(4)),
    })),
  };
}

/**
 * Run all 3 models at once for side-by-side comparison.
 */
export function attributeAll(
  touchpoints: Touchpoint[],
  conversionAt: Date,
): Record<AttributionModel, AttributionResult> {
  return {
    linear: attribute(touchpoints, conversionAt, 'linear'),
    time_decay: attribute(touchpoints, conversionAt, 'time_decay'),
    position_based: attribute(touchpoints, conversionAt, 'position_based'),
  };
}
