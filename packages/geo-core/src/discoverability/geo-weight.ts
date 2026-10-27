/**
 * GEO 权重评分标准模型 (GEO Weight Scoring Policy)
 * 参考 GEOInflow (v2.1-bands-evidence) 官方标准，计算内容或网站在 AI 搜索引擎生态中的被引用权重。
 * 
 * 核心公式：
 * W = 10 * E_search + 7 * E_user + 3 * E_training
 * - E_search: 搜索型抓取 (如 Bytespider / Baiduspider)
 * - E_user: 用户端主动触发 (如 KimiBot / ChatGPT-User 实时对话联网搜索)
 * - E_training: 基础模型离线训练抓取 (如 DeepSeekBot / HunyuanBot)
 */

export interface GEOWatermarkUnits {
  searchUnits: number;
  userUnits: number;
  trainingUnits: number;
}

export interface GEOW处的权重结果 {
  weightedScore: number;
  level: number; // 1 ~ 10
  description: string;
}

const LEVEL_BANDS = [
  { min: 20000000, level: 10, desc: '超级权威源 (全网顶尖)' },
  { min: 5000000, level: 9, desc: '行业顶级信源' },
  { min: 1000000, level: 8, desc: '高权重专业站点' },
  { min: 200000, level: 7, desc: '深度收录站点' },
  { min: 50000, level: 6, desc: '稳定收录与高频抓取' },
  { min: 10000, level: 5, desc: '被 AI 引擎常规采纳' },
  { min: 2000, level: 4, desc: '具备基础 AI 抓取权重' },
  { min: 500, level: 3, desc: '起步收录' },
  { min: 100, level: 2, desc: '初步发现' },
  { min: 1, level: 1, desc: '痕迹捕获' },
  { min: 0, level: 0, desc: '未观察到有效抓取' },
];

export function calculateGEOWeight(units: GEOWatermarkUnits): GEOW处的权重结果 {
  const { searchUnits = 0, userUnits = 0, trainingUnits = 0 } = units;
  
  // W = 10 × E_search + 7 × E_user + 3 × E_training
  const weightedScore = 10 * searchUnits + 7 * userUnits + 3 * trainingUnits;

  for (const band of LEVEL_BANDS) {
    if (weightedScore >= band.min) {
      return {
        weightedScore,
        level: band.level,
        description: band.desc,
      };
    }
  }

  return {
    weightedScore: 0,
    level: 0,
    description: '未观察到有效抓取',
  };
}
