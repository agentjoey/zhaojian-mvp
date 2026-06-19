// @eamvp/llm — 命理+心理 双声部解读层（provider 无关，OpenAI 兼容）
export { resolveLlmConfig, isLlmConfigured } from "./provider";
export type { LlmConfig, LlmProvider, LlmWire } from "./provider";
export { extractFacts } from "./facts";
export type { ChartFacts } from "./facts";
export { buildSystemPrompt, buildUserPrompt, parseSections, sanitizeReading, SECTION_KEYS } from "./prompt";
export { correctMutagens } from "./correct";
export type { ReadingLanguage, SectionKey } from "./prompt";
export { chat, chatStream } from "./client";
export type { ChatMessage } from "./client";
export { generateReading, streamReading, buildMessages } from "./reading";
export type { ReadingOptions } from "./reading";
export { polishDailyFortune } from "./daily";
export { scoreReading } from "./eval/score";
export type { Verdict } from "./eval/score";
export { runEval } from "./eval/run";
export type { EvalReport, CaseResult } from "./eval/run";
export { EVAL_CASES } from "./eval/cases";
