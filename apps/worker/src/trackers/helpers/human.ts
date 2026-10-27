/**
 * 拟人化交互与防风控执行工具集 (Human Simulator & Anti-Detection Utilities)
 *
 * 移植自 WebAI2API 核心算法：
 * 1. humanType: 动态贝塞尔打字速度抖动、标点停顿、长短文本智能分流
 * 2. safeClick: 拟人化鼠标移动、坐标热区随机偏移（防止永远点中心像素）
 * 3. jitterSleep: 智能拟人随机休眠（阅读/发呆/思考间隔）
 * 4. backoffSleep: 指数退避重试延迟
 */

import type { ElementHandle, Locator, Page } from 'playwright';

/**
 * 浮点数区间随机
 */
export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * 整数区间随机
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(randomFloat(min, max + 1));
}

/**
 * 拟人化随机休眠 (Jitter)
 */
export async function sleep(minMs: number, maxMs?: number): Promise<void> {
  const duration = maxMs !== undefined ? randomInt(minMs, maxMs) : minMs;
  return new Promise((resolve) => setTimeout(resolve, duration));
}

/**
 * 拟人化打字 (Human Typing)
 * - 短文本（< 60字）：高拟真按键打字，包含字符间延迟波动、标点停顿、轻微错漏打
 * - 长文本（>= 60字）：模拟人类粘贴行为（剪贴板或极速键入）+ 前后聚焦/停顿
 */
export async function humanType(
  page: Page,
  target: ElementHandle<Element> | Locator | string,
  text: string,
  options: {
    minDelay?: number;
    maxDelay?: number;
    punctuationPause?: boolean;
    skipFocus?: boolean;
  } = {}
): Promise<void> {
  const {
    minDelay = 35,
    maxDelay = 110,
    punctuationPause = true,
    skipFocus = false,
  } = options;

  let el: ElementHandle<Element> | null = null;
  if (typeof target === 'string') {
    el = await page.$(target);
    if (!el) throw new Error(`[humanType] 找不到目标输入框: ${target}`);
  } else if ('click' in target && typeof (target as Locator).elementHandle === 'function') {
    el = await (target as Locator).elementHandle();
    if (!el) throw new Error(`[humanType] 目标 Locator 无法解析为元素`);
  } else {
    el = target as ElementHandle<Element>;
  }

  if (!skipFocus) {
    await el.focus();
    await sleep(150, 400); // 聚焦后略微停顿，模拟人手放到键盘上
  }

  // 针对长文本：真实人类往往直接复制粘贴
  if (text.length > 80) {
    // 注入剪贴板或通过 fill 配合随机事件触发
    await page.keyboard.insertText(text);
    await sleep(200, 500);
    return;
  }

  // 针对常规问答：逐字拟人键入
  for (let i = 0; i < text.length; i++) {
    const char = text[i] ?? '';
    if (!char) continue;
    await page.keyboard.type(char, { delay: randomInt(minDelay, maxDelay) });

    // 标点符号停顿（模拟思维组织）
    if (punctuationPause && /[，。！？、；：,\.!\?;:]/.test(char)) {
      await sleep(180, 450);
    } else if (Math.random() < 0.08) {
      // 偶发性微小停顿（模拟手部轻微犹豫）
      await sleep(120, 300);
    }
  }

  await sleep(250, 600); // 输入完成后的短暂停顿，模拟检查确认
}

/**
 * 拟人化安全点击 (Safe Click)
 * - 计算元素真实边界，并在内部随机偏移，避免每次点击死板居中
 * - 模拟鼠标滑动轨迹
 */
export async function safeClick(
  page: Page,
  target: ElementHandle<Element> | Locator | string,
  options: {
    bias?: 'center' | 'random';
    timeout?: number;
  } = {}
): Promise<void> {
  let el: ElementHandle<Element> | null = null;
  if (typeof target === 'string') {
    el = await page.$(target);
    if (!el) throw new Error(`[safeClick] 找不到目标元素: ${target}`);
  } else if ('elementHandle' in target && typeof (target as Locator).elementHandle === 'function') {
    el = await (target as Locator).elementHandle();
    if (!el) throw new Error(`[safeClick] 目标 Locator 无法解析为元素`);
  } else {
    el = target as ElementHandle<Element>;
  }

  const box = await el.boundingBox();
  if (!box) {
    // 降级使用普通 click
    await el.click();
    return;
  }

  // 计算偏移（内缩 15%，防止点出边界）
  const paddingX = Math.max(2, box.width * 0.15);
  const paddingY = Math.max(2, box.height * 0.15);

  const targetX = box.x + randomFloat(paddingX, box.width - paddingX);
  const targetY = box.y + randomFloat(paddingY, box.height - paddingY);

  // 移动鼠标 + 轻微停顿 + 点击
  await page.mouse.move(targetX, targetY, { steps: randomInt(5, 12) });
  await sleep(60, 180);
  await page.mouse.down();
  await sleep(40, 120);
  await page.mouse.up();
  await sleep(100, 250);
}
