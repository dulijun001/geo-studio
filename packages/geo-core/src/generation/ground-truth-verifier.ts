/**
 * Milestone 4: Ground-Truth 事实白名单与原文自动化比对校验器 (D34 升级)
 *
 * 结合 DeepSeek Tool Client (Fetch & Search)，对文本中命中的引用、政策或未命中的可疑引用，
 * 进行原生 Markdown 原文抓取与事实一致性校验（校验年份、发布主体、条款真伪）。
 */

import { defaultDeepSeekTools, type DeepSeekToolClient } from '../llm/deepseek-tools';
import {
  type VerifiedCitation,
  type CitationCheckResult,
  type CitationDetailIssue,
  checkCitations,
} from './citation-check';

export type GroundTruthVerificationResult = CitationCheckResult & {
  ground_truth_scanned: boolean;
  ground_truth_verifications: Array<{
    needle: string;
    target_url?: string;
    verified_in_source: boolean;
    evidence_snippet?: string;
    note?: string;
  }>;
};

export interface GroundTruthVerifierOptions {
  client?: DeepSeekToolClient;
  autoFetchSources?: boolean;
  timeoutMs?: number;
}

/**
 * 针对引用条款进行 Ground-Truth 原文比对验证
 *
 * 1. 执行既有 checkCitations (正则 + 内存白名单快速筛选)
 * 2. 若配置了 DeepSeek 工具且开启 autoFetchSources：
 *    - 对带 source_url 的白名单项或疑似未命中引用的条目，通过 Fetch 获取原文 Markdown
 *    - 检查引用的年份与发行主体是否在原文中出现
 */
export async function verifyCitationsWithGroundTruth(
  body: string,
  whitelist: Array<VerifiedCitation & { source_url?: string }>,
  options: GroundTruthVerifierOptions = {},
): Promise<GroundTruthVerificationResult> {
  const baseResult = checkCitations(body, whitelist);
  const client = options.client || defaultDeepSeekTools;

  // 若未配置 API Key 或无需原文在线校验，直接返回基础比对结果
  if (!client.isConfigured() || options.autoFetchSources === false) {
    return {
      ...baseResult,
      ground_truth_scanned: false,
      ground_truth_verifications: [],
    };
  }

  const verifications: GroundTruthVerificationResult['ground_truth_verifications'] = [];
  const additionalDetailIssues: CitationDetailIssue[] = [...(baseResult.detail_issues || [])];

  // 对匹配成功的条目，若有 source_url，验证其真实原文
  for (const match of baseResult.matches) {
    const entry = whitelist.find((w) => w.id === match.verified_id);
    if (!entry?.source_url) continue;

    try {
      const fetched = await client.fetchMarkdown(
        entry.source_url,
        options.timeoutMs || 8000,
      );

      const mdContent = fetched.markdown || '';
      let verified = true;
      let note = '原文抓取校验一致';

      // 验证年份是否在原文中出现 (如果条目指定了年份)
      if (entry.publication_year && !mdContent.includes(String(entry.publication_year))) {
        verified = false;
        note = `原文中未发现指定年份 ${entry.publication_year}`;
        additionalDetailIssues.push({
          match_id: entry.id,
          needle: match.needle,
          issue: 'year_mismatch',
          expected: String(entry.publication_year),
          actual: '原文未载明该年份',
          context_snippet: `Source: ${entry.source_url}`,
        });
      }

      // 验证发布者是否在原文中出现
      if (entry.issuer && !mdContent.includes(entry.issuer)) {
        verified = false;
        note = `原文中未发现指定发布方 ${entry.issuer}`;
        additionalDetailIssues.push({
          match_id: entry.id,
          needle: match.needle,
          issue: 'issuer_mismatch',
          expected: entry.issuer,
          actual: '原文未载明该发布方',
          context_snippet: `Source: ${entry.source_url}`,
        });
      }

      verifications.push({
        needle: match.needle,
        target_url: entry.source_url,
        verified_in_source: verified,
        evidence_snippet: mdContent.slice(0, 150).replace(/\s+/g, ' ').trim(),
        note,
      });
    } catch (err: any) {
      verifications.push({
        needle: match.needle,
        target_url: entry.source_url,
        verified_in_source: false,
        note: `原文获取失败: ${err.message || String(err)}`,
      });
    }
  }

  const isHallucination =
    baseResult.unmatched.length > 0 || additionalDetailIssues.length > 0;

  return {
    ...baseResult,
    detail_issues: additionalDetailIssues,
    verdict: isHallucination ? 'suspected_hallucination' : baseResult.verdict,
    ground_truth_scanned: true,
    ground_truth_verifications: verifications,
  };
}
