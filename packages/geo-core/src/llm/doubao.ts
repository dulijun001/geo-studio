/**
 * 兼容入口 —— 保持 `import { chat, isAvailable } from '../llm/doubao'` 这一
 * 历史路径可用(全仓 13 处调用点),内部已改为多通道路由。
 *
 * 实际实现分三层:
 *   provider-ark.ts     火山方舟(豆包)主通道
 *   provider-openai.ts  任意 OpenAI 兼容备用通道
 *   chat.ts             路由 + 系统性失败自动切换
 *
 * 新代码请直接从 './chat' 引入;本文件不再新增内容。
 */

export { chat, isAvailable, channelStatus, isSwitchableFailure, fallbackDescribe } from './chat';
export type { ChatMessage, ChatOptions, ChatResult } from './provider-ark';
