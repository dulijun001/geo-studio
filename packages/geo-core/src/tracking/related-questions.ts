/**
 * 从 AI 答案里挖「引擎自己推荐的后续提问」(D65,2026-09-11)。
 *
 * 为什么值钱:
 *   题库此前两个来源——人工补题、LLM 凭空扩题(D31 expandSubtopics),两个都是
 *   「我们猜用户会问什么」。而豆包每条答案末尾都会吐 3 个推荐提问,那是**引擎自己
 *   认定的相关问法**,等于目标引擎直接告诉你它下一步想接什么题。比猜准得多,而且
 *   这些数据早就躺在 geo_snapshots.raw_response 里,不用再爬一次、零成本。
 *
 *   这也是腾讯 AnswerBit「AI 推荐提问」那一格的等价物,但来源更硬:
 *   腾讯是拿热点平台数据反推,我们是直接从目标引擎的输出里拿。
 *
 * 真实格式(100 条实采样本归纳):
 *   …如果你愿意,我可以帮你整理一份清单。 昆明哪家医院做牙周治疗比较好? 昆明牙周
 *   治疗可以用医保报销吗? 牙龈出血除了牙周炎还有哪些原因? 昆明哪家医院做牙周治疗
 *   比较好? 昆明牙周治疗可以用医保报销吗? 牙龈出血除了牙周炎还有哪些原因?
 *
 * 关键观察:**这 3 条会原样重复两遍**(豆包 DOM 里推荐区渲染了两份)。
 * 这个重复不是噪声,是天然校验信号——找「最长的、前半段等于后半段」的问句后缀,
 * 就能精确切出推荐区,顺带把正文里恰好以问号结尾的句子(比如相关视频标题
 * 「你们有被坑的经历吗?」)排除在外。比拍一个「取最后 3 句」的阈值稳得多。
 */

/** 一条推荐提问的合理长度,太短的是语气词,太长的是正文句子被误切。 */
const MIN_LEN = 6;
const MAX_LEN = 44;

export type RelatedQuestions = {
  questions: string[];
  /**
   * 是否命中「前半段 == 后半段」的重复结构。
   * true  = 高置信,确实切到了推荐区
   * false = 退化模式(只找到一份),置信度低,调用方可以选择丢弃
   */
  doubled: boolean;
};

/**
 * 抽取答案尾部的引擎推荐提问。
 * 拿不到时返回空数组,不抛错——正文格式随时可能变,这条链路不该因此中断。
 */
export function extractRelatedQuestions(text: string): RelatedQuestions {
  if (!text) return { questions: [], doubled: false };

  // 只看尾部,正文中间的问句不参与
  const tail = text.slice(-1200);
  const chunks = tail.split(/\s+/).filter(Boolean);

  // 从末尾往前收集连续的「问句块」
  const run: string[] = [];
  for (let i = chunks.length - 1; i >= 0; i -= 1) {
    const c = chunks[i] ?? '';
    if (!isQuestionChunk(c)) break;
    run.unshift(c);
  }
  if (run.length === 0) return { questions: [], doubled: false };

  // 找最长的「前半 == 后半」偶数后缀,那才是推荐区
  for (let half = Math.floor(run.length / 2); half >= 1; half -= 1) {
    const tailRun = run.slice(run.length - half * 2);
    const a = tailRun.slice(0, half);
    const b = tailRun.slice(half);
    if (a.every((x, i) => x === b[i])) {
      return { questions: dedupe(a), doubled: true };
    }
  }

  // 没有重复结构:退化成「就这几条」,但标记低置信交给调用方决定
  return { questions: dedupe(run), doubled: false };
}

function isQuestionChunk(c: string): boolean {
  if (!c.endsWith('？') && !c.endsWith('?')) return false;
  const len = c.length;
  if (len < MIN_LEN || len > MAX_LEN) return false;
  // 推荐提问是干净的一句话,不会带这些正文标点
  return !/[。！；：,，、\n#]/.test(c);
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of list) {
    const key = q.replace(/\s/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}
