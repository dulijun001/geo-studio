/**
 * markdown-prettify — 把 LLM 输出的"全挤一行"raw markdown 重新排版。
 *
 * 起源:
 *   豆包 / ARK 思考模型 structured output 经常吐出
 *   `xxx。### 下一段xxx。1. **Q:xx?**A:xxx。2. **Q:...`
 *   这样的单行 markdown,inline-edit-body 的 textarea 原样显示就是一坨,
 *   合规审编辑时根本看不清结构;同时数字范围会写成 "2026 - 04" / "40 - 60 岁"
 *   这种格式抖动,impair 阅读 + 影响 GEO 引用稳定性。
 *
 * 纯函数 — 不调 LLM,不写 DB,不改语义,只调整空白与换行。
 * Idempotent:跑两遍跟跑一遍结果一致(允许偶尔轻微差异)。
 *
 * 调用位置(2026-05-28 起):
 *   - inline-edit-body.tsx 编辑模式「美化排版」按钮(客户端 fallback)
 *   - ai-draft-core runAiDraft 写库前(服务端自动跑)
 *
 * 不做的事(防过度):
 *   - 不重新摘要 / 不动 LLM
 *   - 不改 D21 slice 字段(那是 DB 层)
 *   - 不写库(caller 控制保存)
 *   - 不改业务语义,只动空白
 */

export function prettifyMarkdown(raw: string): string {
  if (!raw) return raw;
  let s = raw;

  // 1. `### Heading` 前后加空行
  // 1a. heading 前换行
  s = s.replace(/[ \t]*(#{1,6})[ \t]+/g, '\n\n$1 ');
  // 1b. 中文标题边界 — **不做**。
  //     LLM 输出 "### 常见误区与问题解释针对..." 标题与正文粘连无标点分隔,
  //     任何启发式拆分都会误伤(长度阈值会截在错位)。承认 markdown
  //     渲染器侧处理(prose-invert 等),prettify 不强行拆中文标题。
  // 1c. 英文/混合标题边界 — "### FAQ 1." / "### Trust Block •"
  //     英文 token 边界清晰,可靠拆分。
  s = s.replace(
    /(\n#{1,6}[ \t][A-Za-z][A-Za-z ]{0,30})(\d+\.|\*\*Q|[一-龥•])/g,
    '$1\n\n$2',
  );

  // 2. FAQ 块结构 — Q/A 分段
  // 2a. "N. **Q:" 前换行 — 前置触发器扩展为 中文标点 / \n / 空格,覆盖
  //     "### FAQ 1. **Q:" 这种 heading 后立刻 FAQ 的情况
  s = s.replace(/([。?!\?．\n ])\s*(\d+)[.．、]\s*\*\*Q[:：]\*?\*?[ \t]*/g, '$1\n\n$2. **Q:** ');
  // 2b. 单独 "**Q:"(无数字前缀)前换行
  s = s.replace(/([。?!\?．\n])\s*\*\*Q[:：]\*?\*?[ \t]*/g, '$1\n\n**Q:** ');
  // 2c. "**A:" 独立成段(无论前面是什么)
  //     注意:LLM 输出常见 "**Q:xxx?**A:..." 模式,Q 末尾的 `**` 实际是 A 的开头
  //     处理思路:抓 "**A:"(无论前面有几个 *),统一换行+补齐 `**A:** `
  s = s.replace(/[ \t]*\*+A[:：][ \t]*/g, '\n\n**A:** ');

  // 3. 数字列表 "N. " 前换行(非 Q/A 用)— 仅在中文标点后 + 后续是中文字符
  //    避免误伤 "1 - 2 天" "第 3 次" 这类自然数字
  s = s.replace(/([。?!\?．])\s*(\d+)[.．、][ \t]*(?=[一-龥])/g, '$1\n\n$2. ');

  // 4. Bullet list 前换行(保留 • 符号,LLM 常用)
  s = s.replace(/[ \t]*[•·][ \t]*/g, '\n• ');

  // 5. 数字间多余空格 — 修常见格式抖动
  //    "2026 - 05" → "2026-05" / "1 - 2 天" → "1-2 天" / "1-3 个月" 保留
  s = s.replace(/(\d)\s+-\s+(\d)/g, '$1-$2');

  // 6. 半角全角空白清理
  //    多个连续空格 / 全角空格 → 单空格(不动换行)
  s = s.replace(/[ \t　]+/g, ' ');

  // 7. 行末空白清理 + 多余空行折叠 + 整体 trim
  s = s
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}
