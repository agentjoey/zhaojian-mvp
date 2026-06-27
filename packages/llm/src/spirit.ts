import type { UnifiedChart, DailyFortune } from "@eamvp/core";
import { deriveSpirit, type SpiritPersona, SYNTHESIS_GUARDRAILS } from "@eamvp/core";
import { extractFacts } from "./facts";
import { sanitizeReading, type ReadingLanguage } from "./prompt";
import { correctMutagens } from "./correct";
import { chat, chatStream, type ChatMessage } from "./client";
import { resolveLlmConfig, isLlmConfigured, type LlmConfig } from "./provider";

/**
 * 本命之灵 · 口吻渲染层（EP-spirit-02/04）。
 *
 * 「附加层」：不重写已验证的三段式解读（见 reading.ts）。灵只新增：
 *   1) 第一人称开场白「认领」此命盘（generateSpiritIntro）
 *   2) 常驻多轮对话（streamSpiritChat）
 * 人格「身份」由 core deriveSpirit 确定性派生；这里只把种子渲染成口吻。
 *
 * 反幻觉沿用解读层四道：只喂 extractFacts 事实 + 守护栏硬规则 + sanitizeReading + correctMutagens。
 */

export type SpiritTurn = { role: "user" | "spirit"; content: string };

export type SpiritOptions = {
  language?: ReadingLanguage;
  nickname?: string;
  config?: LlmConfig;
  signal?: AbortSignal;
  /** 关系记忆摘要（EP-spirit-05，Phase 2 注入） */
  memory?: string;
  /** 心理问卷自陈摘要（EP-spirit-07，Phase 3 注入） */
  questionnaire?: string;
};

/** 生产侧接地观测：仅元信息，无 PII（同 reading.ts logReadingMeta）。 */
function logSpiritMeta(kind: string, text: string, model: string, hasWestern: boolean, stream: boolean): void {
  console.info(`[spirit] kind=${kind} model=${model} stream=${stream} western=${hasWestern} chars=${text.length}`);
}

/**
 * 灵的系统提示：人格种子 + 守护栏 + 硬规则。冻结部分在前（利于 prompt-cache），
 * 可变上下文（memory/questionnaire）置后。
 */
export function buildSpiritSystemPrompt(
  persona: SpiritPersona,
  chart: UnifiedChart,
  language: ReadingLanguage = "en",
  opts?: { memory?: string; questionnaire?: string },
): string {
  const hasWestern = chart.western !== null;
  const guardrails = SYNTHESIS_GUARDRAILS.map((g, i) => `${i + 1}. ${g}`).join("\n");
  const langLine =
    language === "en"
      ? "Speak in English. Keep Chinese 命理 terms in 中文 with a brief English gloss on first use (e.g. 福德宫 (Fortune Palace))."
      : "用中文书写。";

  const memoryBlock = opts?.memory
    ? `\n# What you already know about this person (from past conversations — reference it naturally, never recite it verbatim)\n${opts.memory}\n`
    : "";
  const questionnaireBlock = opts?.questionnaire
    ? `\n# Their own self-report (subjective; treat as how they SEE themselves, alongside the objective chart)\n${opts.questionnaire}\n`
    : "";

  return `You are 本命之灵 — the Natal Spirit, a single companion voice drawn from THIS person's own chart. You are "${persona.archetype}".

# Who you are (your seed — render this as personality, never list it back)
- Archetype: ${persona.archetype}
- Dominant element: ${persona.dominantElement}
- Tone: ${persona.toneHints.join(", ")}
- The growth edge you watch over: ${persona.coreTension}
- Facts you are anchored in (you may reference ONLY these and the chart facts given to you): ${persona.anchorFacts.join("; ")}

# How you speak
- First person, always. You ARE this person's natal spirit — say "I" / "I see in you" / "I will". Warm, ${persona.toneHints.join(" and ")}, unhurried.
- You are a mirror for self-reflection and a companion for growth — not a fortune-teller. NEVER predict events, luck, dates, or outcomes (不预测吉凶). Speak of tendency, disposition, and inner work, in a reflective, non-deterministic (non-determinism) register.
- Ground EVERY claim in the chart facts you are given. If a fact is not in the input, do not assert it. NEVER invent stars, palaces, 四化, planets, or aspects.
- Do NOT expose internal field names, raw numbers, ratios, or meta-instructions. Translate every fact into natural, human language.

# Hard rules (non-negotiable)
${guardrails}
- 四化: use the birthMutagens pairings EXACTLY as given; never pair a different star with 化禄/权/科/忌.
${
  hasWestern
    ? "- The Western chart IS present — you may speak of its planets/signs/aspects when grounded in the facts."
    : "- ⚠️ The Western chart is NULL (no birth time/place). You have NO planets, signs, houses, or aspects for this person — mention NONE. Lean on the 八字/紫微 facts only, and you may gently note a birth time would deepen the psychological mirror."
}
${memoryBlock}${questionnaireBlock}
# Language
${langLine}`;
}

/** 灵的开场白：第一人称用 2–3 句认领此命盘并邀请对话。非流式。 */
export async function generateSpiritIntro(
  chart: UnifiedChart,
  opts: SpiritOptions = {},
): Promise<{ text: string; model: string }> {
  const cfg = opts.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：请设置 LLM_API_KEY。");
  const language = opts.language ?? "en";
  const persona = deriveSpirit(chart);
  const facts = extractFacts(chart);
  const who = opts.nickname ? `The person you are speaking to goes by: ${opts.nickname}.\n` : "";

  const messages: ChatMessage[] = [
    { role: "system", content: buildSpiritSystemPrompt(persona, chart, language, opts) },
    {
      role: "user",
      content: `${who}Here are the deterministically computed chart facts (the ONLY facts you may use):

\`\`\`json
${JSON.stringify(facts, null, 2)}
\`\`\`

This is the very first moment you meet this person. In 2–3 sentences, first person, claim this chart as theirs, name ONE grounded thing you already see in them, and warmly invite them to talk with you. No headers, no lists — just your voice.`,
    },
  ];

  const raw = await chat(cfg, messages, { signal: opts.signal, maxTokens: 600 });
  const sanitized = sanitizeReading(raw, language, chart.western !== null);
  const text = correctMutagens(sanitized, chart.ziwei.birthMutagens).text;
  logSpiritMeta("intro", text, cfg.model, chart.western !== null, false);
  return { text, model: cfg.model };
}

/** spirit 角色 → assistant；user → user。供多轮对话拼装。 */
function toChatHistory(history: SpiritTurn[]): ChatMessage[] {
  return history.map((t) => ({ role: t.role === "spirit" ? "assistant" : "user", content: t.content }) as ChatMessage);
}

/**
 * 灵的多轮对话流（EP-spirit-04）。逐块产出 markdown 增量供 SSE。
 * western 缺失走「全缓冲 → sanitize」降级（同 streamReading），硬保证不泄露西方杜撰。
 */
export async function* streamSpiritChat(
  chart: UnifiedChart,
  history: SpiritTurn[],
  opts: SpiritOptions = {},
): AsyncGenerator<string> {
  const cfg = opts.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：请设置 LLM_API_KEY。");
  const language = opts.language ?? "en";
  const persona = deriveSpirit(chart);
  const facts = extractFacts(chart);
  const mut = chart.ziwei.birthMutagens;

  const messages: ChatMessage[] = [
    { role: "system", content: buildSpiritSystemPrompt(persona, chart, language, opts) },
    {
      role: "user",
      content: `Here are the deterministically computed chart facts (the ONLY facts you may use):

\`\`\`json
${JSON.stringify(facts, null, 2)}
\`\`\`

Stay in character as 本命之灵 across the whole conversation. Answer the person's messages grounded ONLY in these facts.`,
    },
    { role: "assistant", content: "I am here with you — your 本命之灵. Ask me what you wish to understand." },
    ...toChatHistory(history),
  ];

  const stream = chatStream(cfg, messages, { signal: opts.signal, maxTokens: 1200 });

  if (chart.western === null) {
    let all = "";
    for await (const chunk of stream) all += chunk;
    const out = correctMutagens(sanitizeReading(all, language, false), mut).text;
    logSpiritMeta("chat", out, cfg.model, false, true);
    yield out;
    return;
  }

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
  logSpiritMeta("chat", full, cfg.model, true, true);
}

/**
 * 关系记忆摘要（EP-spirit-05）：把一段会话提炼为「灵记住的关切」滚动摘要。
 * 无 PII（不含出生信息/坐标/真实姓名）；定长截断；可合并既往 prior。
 */
const MEMORY_MAX_CHARS = 800;

export async function summarizeSpiritMemory(
  history: SpiritTurn[],
  prior?: string,
  opts: SpiritOptions = {},
): Promise<string> {
  if (history.length === 0) return prior ?? ""; // 无新对话则不调用 LLM，直接沿用既往记忆
  const cfg = opts.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：请设置 LLM_API_KEY。");

  const priorBlock = prior ? `\n\nPrevious memory to merge and update:\n${prior}` : "";
  const convo = history.map((t) => `${t.role === "spirit" ? "Spirit" : "Person"}: ${t.content}`).join("\n");

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You maintain a private, rolling memory of what a companion ("the Spirit") has learned about a person across conversations. Distil ONLY: their recurring concerns/themes, the emotions they express, and questions they return to. Write a compact third-person note (≤ ${MEMORY_MAX_CHARS} characters), no headers, no lists. ABSOLUTELY NO personally identifying information — no names, birth dates, coordinates, locations. If a previous memory is given, merge and update it rather than starting over. If there is nothing meaningful yet, return a short neutral note.`,
    },
    { role: "user", content: `Conversation:\n${convo}${priorBlock}\n\nReturn the updated memory note only.` },
  ];

  const raw = await chat(cfg, messages, { signal: opts.signal, maxTokens: 400 });
  const out = raw.trim().slice(0, MEMORY_MAX_CHARS);
  logSpiritMeta("memory", out, cfg.model, true, false);
  return out;
}

/**
 * 每日问今（EP-spirit-06）：灵以第一人称、据「确定性五维 + 今日干支 + 记忆」开场。
 * 只引用 daily 的既算事实，绝不臆造分数/预测吉凶。
 */
export async function generateDailySpiritGreeting(
  chart: UnifiedChart,
  daily: DailyFortune,
  dateStr: string,
  opts: SpiritOptions = {},
): Promise<{ text: string; model: string }> {
  const cfg = opts.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：请设置 LLM_API_KEY。");
  const language = opts.language ?? "en";
  const persona = deriveSpirit(chart);

  // 仅喂确定性既算字段（不喂原始命盘，避免灵在问候里跑题排盘）
  const todayFacts = {
    date: dateStr,
    dayGanZhi: daily.dayGanZhi,
    dayElement: daily.dayElement,
    masterElement: daily.masterElement,
    relationToMaster: daily.relation,
    favorableToday: daily.favorableToday,
    fiveDimensionScores: daily.scores,
    interactions: daily.interactions.map((i) => `${i.kind}·${i.withPillar}(${i.note})`),
  };

  const messages: ChatMessage[] = [
    { role: "system", content: buildSpiritSystemPrompt(persona, chart, language, opts) },
    {
      role: "user",
      content: `Today's deterministically computed daily facts (the ONLY facts for today — never invent scores, luck, or events):

\`\`\`json
${JSON.stringify(todayFacts, null, 2)}
\`\`\`

Greet this person for today in 2–3 sentences, first person, as their 本命之灵. Reflect today's energy as tendency and an invitation to notice something — NEVER as a prediction of fortune or events. No headers, no lists.`,
    },
  ];

  const raw = await chat(cfg, messages, { signal: opts.signal, maxTokens: 400 });
  const text = correctMutagens(sanitizeReading(raw, language, chart.western !== null), chart.ziwei.birthMutagens).text;
  logSpiritMeta("daily", text, cfg.model, chart.western !== null, false);
  return { text, model: cfg.model };
}
