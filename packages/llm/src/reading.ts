import type { UnifiedChart } from "@eamvp/core";
import { resolveLlmConfig, isLlmConfigured, type LlmConfig } from "./provider";
import { extractFacts } from "./facts";
import { buildSystemPrompt, buildUserPrompt, parseSections, sanitizeReading, type ReadingLanguage, type SectionKey } from "./prompt";
import { correctMutagens } from "./correct";
import { chat, chatStream, type ChatMessage } from "./client";

export type ReadingOptions = {
  language?: ReadingLanguage;
  nickname?: string;
  focus?: string;
  config?: LlmConfig; // 测试/覆盖用，默认从 env 解析
  signal?: AbortSignal;
};

/** 生产侧接地观测（EP-514）：仅记录元信息，无任何出生信息/昵称（无 PII）。 */
function logReadingMeta(markdown: string, model: string, hasWestern: boolean, stream: boolean): void {
  const sections = (markdown.match(/^##\s+/gm) ?? []).length;
  console.info(`[reading] model=${model} stream=${stream} western=${hasWestern} sections=${sections}/4 chars=${markdown.length}`);
}

function buildMessages(chart: UnifiedChart, opts: ReadingOptions): ChatMessage[] {
  const language = opts.language ?? "en";
  const facts = extractFacts(chart);
  return [
    { role: "system", content: buildSystemPrompt(language, chart.western !== null) },
    { role: "user", content: buildUserPrompt(facts, { nickname: opts.nickname, focus: opts.focus }) },
  ];
}

/** 非流式：返回切好分节的解读 + 原始 markdown。 */
export async function generateReading(
  chart: UnifiedChart,
  opts: ReadingOptions = {},
): Promise<{ markdown: string; sections: Record<SectionKey, string>; model: string }> {
  const cfg = opts.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：请设置 LLM_API_KEY（及可选 LLM_PROVIDER/LLM_MODEL）。");
  const language = opts.language ?? "en";
  const raw = await chat(cfg, buildMessages(chart, opts), { signal: opts.signal, maxTokens: 4096 });
  const sanitized = sanitizeReading(raw, language, chart.western !== null);
  const markdown = correctMutagens(sanitized, chart.ziwei.birthMutagens).text;
  logReadingMeta(markdown, cfg.model, chart.western !== null, false);
  return { markdown, sections: parseSections(markdown, language), model: cfg.model };
}

/**
 * 流式：逐块产出 markdown 增量（供结果页 SSE 渲染）。
 * western 缺失（降级短文）时改为「缓冲+净化后一次产出」，硬保证不泄露西方杜撰内容；
 * western 存在时正常逐块流式。
 */
export async function* streamReading(chart: UnifiedChart, opts: ReadingOptions = {}): AsyncGenerator<string> {
  const cfg = opts.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：请设置 LLM_API_KEY（及可选 LLM_PROVIDER/LLM_MODEL）。");
  const language = opts.language ?? "en";
  const mut = chart.ziwei.birthMutagens;
  const stream = chatStream(cfg, buildMessages(chart, opts), { signal: opts.signal, maxTokens: 4096 });

  if (chart.western === null) {
    // 降级路径：全缓冲 → 净化（删西方杜撰）+ 四化纠正
    let all = "";
    for await (const chunk of stream) all += chunk;
    const out = correctMutagens(sanitizeReading(all, language, false), mut).text;
    logReadingMeta(out, cfg.model, false, true);
    yield out;
    return;
  }

  // 正常流式：按行缓冲，整行纠正四化后再吐（四化断言在行内，仅增约一行延迟，保留首字速度）
  let line = "";
  let full = "";
  for await (const chunk of stream) {
    line += chunk;
    let nl: number;
    while ((nl = line.indexOf("\n")) >= 0) {
      const out = correctMutagens(line.slice(0, nl + 1), mut).text;
      full += out;
      yield out;
      line = line.slice(nl + 1);
    }
  }
  if (line) {
    const out = correctMutagens(line, mut).text;
    full += out;
    yield out;
  }
  logReadingMeta(full, cfg.model, true, true);
}

export { buildMessages };
