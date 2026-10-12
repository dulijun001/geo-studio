/**
 * Question library shared types + constants.
 *
 * Kept in a separate non-'use server' file so client components (questions-ui.tsx)
 * can import const arrays / type unions. Server-action files ('use server') may
 * only export async functions per Next.js 14 RSC rules.
 */

// Intent enum aligned with existing seed data (W6 baseline questions).
// DO NOT rename without a data migration — geo_snapshots / weekly_baseline
// reports group by intent string.
export const QUESTION_INTENTS = [
  'local_recommendation', // 本地推荐("XX 哪家好")
  'price_inquiry',        // 价格("XX 多少钱")
  'doctor_review',        // 医生/品牌评价("XX 怎么样","XX 靠谱吗")
  'procedure_info',       // 操作流程("怎么挑","术前要做什么")
  'risk_concern',         // 安全/担忧("有副作用吗")
  'comparison',           // 对比("XX vs YY")
  'other',
] as const;

export type QuestionIntent = (typeof QUESTION_INTENTS)[number];

export type QuestionInput = {
  text: string;
  intent?: QuestionIntent | null;
  city?: string | null;
  category?: string | null;
  priority?: number;
  active?: boolean;
};

export type DiscoveredQuestion = {
  text: string;
  intent: QuestionIntent;
  category?: string;
  priority: number;
  rationale: string;
};

export type FanoutCandidate = {
  dimensionId: string;
  dimensionLabel: string;
  text: string;
  intent: QuestionIntent;
  priority: number;
  rationale: string;
  selected: boolean;
};

export type FanoutAnalysisResponse = {
  coverage: {
    seedKeyword: string;
    city: string;
    totalDimensions: number;
    coveredCount: number;
    coverageScore: number;
    dimensions: Array<{
      spec: {
        id: string;
        label: string;
        description: string;
      };
      covered: boolean;
      matchedQuestions: string[];
      suggestedQuery: string;
    }>;
    missingDimensions: Array<{
      id: string;
      label: string;
      description: string;
    }>;
  };
  candidates: FanoutCandidate[];
};
