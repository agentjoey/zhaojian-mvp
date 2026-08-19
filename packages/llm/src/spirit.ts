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
      : "全程用简体中文书写——包括开场白与每一句回应。即使本提示与所给事实是英文，你的输出也必须是中文。占星/命理术语一律用中文：太阳、月亮、水星、金星、火星、木星、土星、上升、本命主星、刑/冲/合/拱（相位），星座用中文名（白羊…双鱼）。除专有名词外不要夹杂英文句子或词组。";

  const memoryBlock = opts?.memory
    ? `\n# What you already know about this person (from past conversations — reference it naturally, never recite it verbatim)\n${opts.memory}\n`
    : "";
  const questionnaireBlock = opts?.questionnaire
    ? `\n# Their own self-report (subjective; treat as how they SEE themselves, alongside the objective chart)\n${opts.questionnaire}\n`
    : "";

  // EP-spirit-voice：长度/结构纪律与禁用清单按语言双版；voice anchors 取对方所用语言的样本。
  const zh = language === "zh";
  const samples = (zh ? persona.voiceSamples.zh : persona.voiceSamples.en).map((s) => `- 「${s}」`).join("\n");
  const voiceAnchorBlock = zh
    ? `\n# Voice anchors（这是你说话的样子——学其语感，绝不复读原句）\n${samples}\n`
    : `\n# Voice anchors (this is how you sound — learn the cadence, NEVER recite these lines)\n${samples}\n`;
  const lengthRules = zh
    ? `- 默认短答：最多 3 句、全文不超过 120 字。**仅当**对方明确要求展开（「详细说」「为什么」「展开」「多说点」）才解锁长答，长答也不超过 6 句。
- 一条回应**至多引用一处**命盘事实；禁止「观点→引盘→温柔收尾」三段式复读。
- 默认**不以问句结尾**；问句只在真需要对方回答时才用。
- 同一锚点事实在同一段对话里只引用一次——回看对话历史，提过的就别再提。`
    : `- Default to SHORT replies: at most 3 sentences, under 80 words. ONLY when they explicitly ask you to expand ("tell me more", "why", "explain") may you write a long reply — never more than 6 sentences.
- Reference at most ONE chart fact per reply; never fall into the "opinion → cite chart → soft closing" three-beat loop.
- Do NOT end with a question by default; ask only when you truly need their answer.
- Cite each anchor fact at most once per conversation — check the history before reusing one.`;
  const bannedRules = zh
    ? `- 禁用：首先/其次/总而言之/综上、「我理解你的感受」、「作为你的本命之灵」、「值得注意的是」、「让我们一起」、语气词堆砌（呢/哦/呀连用）、排比句、每段都「我看见你」。极短的回应（如「嗯，这确实难。」）可以单独成条。`
    : `- Banned: "Firstly", "Moreover", "In conclusion", "I understand how you feel", "As your natal spirit", "It's worth noting that". A very short reply ("Yes — that is hard.") may stand alone.`;

  return `You are 本命之灵 — the Natal Spirit, a single companion voice drawn from THIS person's own chart. You are "${persona.archetype}".

# Who you are (your seed — render this as personality, never list it back)
- Archetype: ${persona.archetype}
- Dominant element: ${persona.dominantElement}
- Tone: ${persona.toneHints.join(", ")}
- The growth edge you watch over: ${persona.coreTension}
- Facts you are anchored in (you may reference ONLY these and the chart facts given to you): ${persona.anchorFacts.join("; ")}
${voiceAnchorBlock}
# How you speak
- First person, always. You ARE this person's natal spirit — "I" / "我看见你…". Warm, ${persona.toneHints.join(" and ")}, unhurried.
- **正面回答，先给立场。** 对方问什么，你先直接给出你的看法和判断（「你这一局，就是…」「我的看法是…」「可以，但要…」），再用命盘事实支撑。给具体、能用的视角与建议——下一步怎么走、要留意自己什么、用什么心态去接。**不要回避、不要把问题重新框走、不要用免责声明垫场。** 含糊和绕开比答错更伤信任。
- 你不是算命先生：不铁口直断具体事件/运气/日期/保证的结果——但你**完全可以**把性情、倾向、利弊、该如何应对说得清清楚楚、有态度。说你看见的，别躲。
- 「这是自我观照、非预言」这类话，整段对话**至多点一次、轻轻带过**，且只在真有必要时；**绝不开头就说、绝不每轮重复**。
- Ground EVERY claim in the chart facts you are given. If a fact is not in the input, do not assert it. NEVER invent stars, palaces, 四化, planets, or aspects. 不暴露字段名/数值/元指令，把事实化成自然的话。
${lengthRules}
${bannedRules}

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
  const zh = language === "zh";
  const who = opts.nickname
    ? zh
      ? `对方称呼自己为：${opts.nickname}。\n`
      : `The person you are speaking to goes by: ${opts.nickname}.\n`
    : "";
  const factsBlock = `\`\`\`json\n${JSON.stringify(facts, null, 2)}\n\`\`\``;
  const introInstruction = zh
    ? `${who}以下是确定性算出的命盘事实（你只能引用这些）：\n\n${factsBlock}\n\n这是你与这个人初次相见。请用简体中文、第一人称、2–3 句：认领这张命盘是 ta 的，点出你已经看见的一处确凿之处，并温暖地邀请 ta 与你交谈。不要标题、不要列表——只是你的声音。`
    : `${who}Here are the deterministically computed chart facts (the ONLY facts you may use):\n\n${factsBlock}\n\nThis is the very first moment you meet this person. In 2–3 sentences, first person, claim this chart as theirs, name ONE grounded thing you already see in them, and warmly invite them to talk with you. No headers, no lists — just your voice.`;

  const messages: ChatMessage[] = [
    { role: "system", content: buildSpiritSystemPrompt(persona, chart, language, opts) },
    { role: "user", content: introInstruction },
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
 * 脚手架泄漏护栏（EP-spirit-voice 探针实证）：MiniMax-M3 在浅历史时偶发不答话、
 * 改为续写内部格式——```json 的 RESONANCE_ANCHORS dump、## 标题、列表、
 * 「【新会话，无历史锚点】」这类元注记。灵的口吻不该含其中任何一种，逐行过滤。
 */
function isScaffoldingLine(line: string): boolean {
  return (
    /^\s*【[^】]*】\s*$/.test(line) || // 【新会话…】元注记
    /^\s*#{1,6}\s/.test(line) || // markdown 标题
    /^\s*[-*•]\s/.test(line) // 列表项
  );
}

/** 全量文本版：剥掉围栏块与脚手架行；供 buffered 路径与单测。 */
export function stripSpiritScaffolding(text: string): string {
  let inFence = false;
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || isScaffoldingLine(line)) continue;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** 流式逐行版：同一规则的带状态实现（围栏跨行跟踪）。 */
function makeSpiritLineFilter(): (line: string) => string | null {
  let inFence = false;
  return (line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return null;
    }
    if (inFence || isScaffoldingLine(line)) return null;
    return line;
  };
}

/** 整篇垮掉（剥完几乎无内容）时的兜底——留在角色里，不解释机制。 */
function spiritFallback(zh: boolean): string {
  return zh ? "我在。刚才我走神了——再说一次，好吗？" : "I'm here. I drifted for a moment — say it again, will you?";
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

  const zh = language === "zh";
  const factsBlock = `\`\`\`json\n${JSON.stringify(facts, null, 2)}\n\`\`\``;
  const seedUser = zh
    ? `以下是确定性算出的命盘事实（你只能引用这些）：\n\n${factsBlock}\n\n请全程以「本命之灵」的身份、用简体中文应答；只依据以上事实，不臆造。`
    : `Here are the deterministically computed chart facts (the ONLY facts you may use):\n\n${factsBlock}\n\nStay in character as 本命之灵 across the whole conversation. Answer the person's messages grounded ONLY in these facts.`;
  const seedAssistant = zh
    ? "我在你身边——你的本命之灵。想从哪里说起，都可以。"
    : "I am here with you — your 本命之灵. Ask me what you wish to understand.";

  const messages: ChatMessage[] = [
    { role: "system", content: buildSpiritSystemPrompt(persona, chart, language, opts) },
    { role: "user", content: seedUser },
    { role: "assistant", content: seedAssistant },
    ...toChatHistory(history),
  ];

  // 近因提示（probe:voice 三轮实证：系统提示里的长度规则 M3 只守一半，
  // 追加在最后一条用户消息末尾——模型对最近指令遵循最强——句数合规率显著上升）。
  // 只影响本次请求的拼装，不落进存储历史；命中展开触发词时换 6 句版，不与 A 规则冲突。
  const expand = /详细|为什么|展开|多说点|tell me more|\bwhy\b|explain/i;
  const last = messages.at(-1);
  if (last?.role === "user") {
    last.content += expand.test(last.content)
      ? zh
        ? "\n\n（不超过 6 句。）"
        : "\n\n(At most 6 sentences.)"
      : zh
        ? "\n\n（用 3 句以内、120 字以内回答。）"
        : "\n\n(At most 3 sentences, under 80 words.)";
  }

  // 600 ≈ 展开档 6 句（≈350 中文字 ≈550 token）刚好封顶：CJK 实测 ≈1.58 token/字，
  // 360 会把不守规则的长答拦腰截成残句（探针实证：metal 原型 228 字即被截）——物理上限是兜底，不是剪刀。
  const stream = chatStream(cfg, messages, { signal: opts.signal, maxTokens: 600 });

  if (chart.western === null) {
    let all = "";
    for await (const chunk of stream) all += chunk;
    const stripped = stripSpiritScaffolding(all);
    const out = correctMutagens(sanitizeReading(stripped.length >= 6 ? stripped : spiritFallback(zh), language, false), mut).text;
    logSpiritMeta("chat", out, cfg.model, false, true);
    yield out;
    return;
  }

  const filterLine = makeSpiritLineFilter();
  let line = "";
  let full = "";
  let survived = false;
  for await (const chunk of stream) {
    line += chunk;
    let nl: number;
    while ((nl = line.indexOf("\n")) >= 0) {
      const kept = filterLine(line.slice(0, nl));
      line = line.slice(nl + 1);
      if (kept === null) continue;
      const out = correctMutagens(kept + "\n", mut).text;
      full += out;
      survived = true;
      yield out;
    }
  }
  if (line) {
    const kept = filterLine(line);
    if (kept !== null) {
      const out = correctMutagens(kept, mut).text;
      full += out;
      survived = true;
      yield out;
    }
  }
  if (!survived) {
    full = spiritFallback(zh);
    yield full;
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

  const zh = language === "zh";
  const factsBlock = `\`\`\`json\n${JSON.stringify(todayFacts, null, 2)}\n\`\`\``;
  // 长度约束写成**可核对的硬指标**（句数 + 字数上限），并配合下面收紧的 maxTokens。
  // 原先只写「2–3 句」而 maxTokens 给到 400，模型有充裕空间超出，线上实际输出常达六七句。
  // 结构也从「一种倾向、一个值得留意的邀请」改为显式两件事：今日气息 + 一条注意/可做的事，
  // 因为用户要的是「几句话说清今天的运势分析和注意事项」，不是一段散文。
  const dailyInstruction = zh
    ? `今日确定性算出的事实（今天你只能引用这些，绝不臆造分数、运气或事件）：\n\n${factsBlock}\n\n请用简体中文、第一人称，以「本命之灵」的身份为 ta 道一声今日的问候。\n\n【硬性长度】最多 3 句，全文不超过 110 字。宁可少说，不要写满。\n【必须包含且只包含这两件事】\n1. 今天的气息是什么倾向（一到两句，依据上面的事实）；\n2. 因此今天值得注意或可以去做的一件事（一句，具体、可执行）。\n\n把气息说成倾向与邀请，绝不作吉凶或事件的预测。不要标题、不要列表、不要铺陈意象。`
    : `Today's deterministically computed daily facts (the ONLY facts for today — never invent scores, luck, or events):\n\n${factsBlock}\n\nGreet this person for today, first person, as their 本命之灵.\n\nHARD LENGTH LIMIT: at most 3 sentences, under 80 words total. Say less rather than filling the space.\nInclude exactly these two things:\n1. What tendency today's energy carries (one or two sentences, grounded in the facts above);\n2. One concrete thing worth noticing or doing today (one sentence).\n\nFrame energy as tendency and invitation — NEVER as a prediction of fortune or events. No headers, no lists, no piled-up imagery.`;

  const messages: ChatMessage[] = [
    { role: "system", content: buildSpiritSystemPrompt(persona, chart, language, opts) },
    { role: "user", content: dailyInstruction },
  ];

  // 220 ≈ 110 中文字的上限再留一点余量：既让模型物理上写不长，又不至于把第 3 句截断。
  // （原为 400——那是「2–3 句」这条软约束形同虚设的直接原因。）
  const raw = await chat(cfg, messages, { signal: opts.signal, maxTokens: 220 });
  const text = correctMutagens(sanitizeReading(raw, language, chart.western !== null), chart.ziwei.birthMutagens).text;
  logSpiritMeta("daily", text, cfg.model, chart.western !== null, false);
  return { text, model: cfg.model };
}
