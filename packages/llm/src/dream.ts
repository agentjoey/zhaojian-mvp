import type { ReadingLanguage } from "./prompt";
import type { UnifiedChart } from "@eamvp/core";
import { deriveSpirit } from "@eamvp/core";
import { extractFacts } from "./facts";
import { sanitizeReading } from "./prompt";
import { correctMutagens } from "./correct";
import { chatStream, type ChatMessage } from "./client";
import { resolveLlmConfig, isLlmConfigured } from "./provider";
import { buildSpiritSystemPrompt, stripSpiritScaffolding, type SpiritOptions } from "./spirit";

/**
 * 解梦后置机械扫描（EP-dream-01）——与 sanitizeFengshui 同层：确定性兜底，不依赖模型自觉。
 * 规则（句级）：单句命中预言措辞 且 同一句内无诚实标注标记 → 剥离该句；句内标注+预言并存 → 保留。
 * 为什么是句级而非段级：prompt 要求模型「一段自然口语走完、不分节」，真实输出就是单段——
 * 段级豁免会让第③拍一个合规标注豁免全篇；句级豁免对应的正是 prompt 的「行内标注」要求
 * （标注必须与预言措辞出现在同一句里才成立）。
 * 中英两张词表都扫（不做语言二选一）：双语混合输出时无盲区，标注判定同样两张表都算。
 * zh 用子串匹配（CJK 无词边界）；en 用词边界正则（\b），避免裸词子串误伤 folks/folklore/Norfolk。
 */

/** 预言措辞：断言未来/吉凶定性。词表扩充时注意——长词在前（「预示着」⊃「预示」靠 some 命中，顺序无害，但剥离以句为单位）。 */
const PREDICTION_ZH = ["预示着", "预示", "将会", "凶兆", "吉兆", "主灾", "主吉", "血光", "大难临头", "必有", "预兆", "征兆", "注定"];
/** en 侧为正则源（套 \b…\b、忽略大小写）；词族用语干+\w*（foretell\w* 覆盖 foretells/foretold）。 */
const PREDICTION_EN = ["foretell\\w*", "an omen", "omen of", "bad omen", "will come true", "means you will", "a sign that you will", "sign of doom", "predicts\\w*"];

/** 诚实标注标记（句级存在性判定）。en 侧整词/短语，裸 "folk" 会命中 folks/folklore/Norfolk，禁用。 */
const MARKER_ZH = ["民间说法", "传统上", "传统说法", "古人认为", "周公解梦", "民俗"];
const MARKER_EN = ["folk saying", "folk tradition", "folklore", "traditionally", "traditional interpretation", "cultural reference"];

const SENTENCE_RE = /[^。！？!?….\n]+[。！？!?….]*/g;

const hitZh = (list: string[], s: string) => list.some((p) => s.toLowerCase().includes(p.toLowerCase()));
const hitEn = (list: string[], s: string) => list.some((p) => new RegExp(`\\b${p}\\b`, "i").test(s));

// language 保留在签名里（调用方按语言传入），但扫描始终两张表都做。
export function sanitizeDream(text: string, _language: ReadingLanguage): { text: string; stripped: string[] } {
  const stripped: string[] = [];
  const hasPrediction = (s: string) => hitZh(PREDICTION_ZH, s) || hitEn(PREDICTION_EN, s);
  const hasMarker = (s: string) => hitZh(MARKER_ZH, s) || hitEn(MARKER_EN, s);

  const paras = text.split("\n").map((para) => {
    const sentences = para.match(SENTENCE_RE) ?? [para];
    const kept = sentences.filter((s) => {
      if (!hasPrediction(s)) return true;
      if (hasMarker(s)) return true; // 句内标注 + 预言并存 → 行内标注成立，保留
      stripped.push(s.trim());
      return false;
    });
    return kept.join("");
  });

  return { text: paras.join("\n").replace(/\n{3,}/g, "\n\n").trim(), stripped };
}

// ─── 解梦（EP-dream-01）────────────────────────────────────────────
// 无计算层模块：锚人不锚梦（spec §2）。buffered 一次性产出——后置扫描（sanitizeDream）
// 需要完整文本，流式逐行吐会让「被剥的预言句」先被用户看到；≤300 字等待可控。

export const DREAM_MAX_CHARS = 2000;

const DREAM_RULES_ZH = `

# 解梦规则（对方讲述的是梦境时适用）
- 按四拍走，一段自然口语走完：不用标题、不分节、不列表——① 你的直观（1–2 句）；② 这个梦在说什么：心理映照，锚到你知道的这个人（记忆/自陈/核心张力），不查符号表；③ 传统说法（有才有，且必须带「民间说法里/传统上认为」这类标注，只作文化参照）；④ 一个邀请（一句，具体可执行）。
- 禁用预言措辞：预示着/将会/凶兆/吉兆/主灾/主吉（第③拍且有标注时除外）。梦中出现死亡、疾病、血光，一律不作预兆解读，只作心理映照。
- 噩梦或痛苦内容：先接住情绪，再给解读；不做医疗或心理诊断。
- 长度：不超过 7 句、260 字（这是留余量的目标，写完超了就删，宁短勿长）。命盘事实至多引一处；默认不以问句结尾。`;

const DREAM_RULES_EN = `

# Dream-reading rules (when they share a dream)
- Four beats in ONE natural spoken paragraph — no headings, no sections, no lists: ① your immediate impression (1–2 sentences); ② what this dream may be processing — psychological reflection anchored in what you know of this person (memory/self-report/core tension), never a symbol dictionary; ③ folk tradition (only if relevant, and ALWAYS marked "folk saying"/"traditionally", as cultural reference only); ④ one invitation (one concrete sentence).
- No prediction wording: "foretells", "omen", "will come true", "means you will" (except in beat ③ with a marker). Death, illness, blood in a dream: never read as omen — psychological reflection only.
- Nightmares or painful content: hold the feeling first, then interpret; no medical or psychological diagnosis.
- Length: at most 7 sentences / 170 words (a target with margin — trim if over; shorter is better). At most ONE chart fact; do not end with a question by default.`;

/**
 * 解梦完整管线（EP-dream-01）：LLM 生成 → 脚手架护栏 → sanitizeReading → sanitizeDream → correctMutagens → fallback。
 * 返回净化后文本与 sanitizeDream 实际剥离的句子（探针据此报告真实剥离数，而非对成品重扫）。
 */
export async function generateDreamReply(
  chart: UnifiedChart,
  dreamText: string,
  opts: SpiritOptions = {},
): Promise<{ text: string; stripped: string[] }> {
  const cfg = opts.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：请设置 LLM_API_KEY。");
  const language = opts.language ?? "en";
  const zh = language === "zh";
  const dream = dreamText.trim();
  if (!dream) throw new Error("梦境内容为空");
  if (dream.length > DREAM_MAX_CHARS) throw new Error(`梦境内容过长（>${DREAM_MAX_CHARS} 字）`);

  const persona = deriveSpirit(chart);
  const facts = extractFacts(chart);
  const system = buildSpiritSystemPrompt(persona, chart, language, opts) + (zh ? DREAM_RULES_ZH : DREAM_RULES_EN);
  const factsBlock = `\`\`\`json\n${JSON.stringify(facts, null, 2)}\n\`\`\``;
  const user = zh
    ? `以下是确定性算出的命盘事实（你只能引用这些）：\n\n${factsBlock}\n\n对方讲述了一个梦：\n\n「${dream}」\n\n请以「本命之灵」的身份、用简体中文、按解梦规则回应这个梦。`
    : `Here are the deterministically computed chart facts (the ONLY facts you may use):\n\n${factsBlock}\n\nThey shared a dream:\n\n"${dream}"\n\nRespond as their 本命之灵, following the dream-reading rules.`;

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const stream = chatStream(cfg, messages, { signal: opts.signal, maxTokens: 700 });
  let all = "";
  for await (const chunk of stream) all += chunk;

  let out = stripSpiritScaffolding(all);
  out = sanitizeReading(out, language, chart.western !== null);
  const scan = sanitizeDream(out, language);
  out = scan.text;
  out = correctMutagens(out, chart.ziwei.birthMutagens).text;
  if (out.length < 6) {
    out = zh ? "我在。这个梦先放在这里——再说一遍给我听，好吗？" : "I'm here. Let's set this dream down for a moment — tell it to me again?";
  }
  console.info(`[dream] model=${cfg.model} chars=${out.length} stripped=${scan.stripped.length}`);
  return { text: out, stripped: scan.stripped };
}

/**
 * 解梦（EP-dream-01）：灵的专门技能。buffered 单次 yield。
 * generateDreamReply 的 AsyncGenerator 薄封装，对外签名不变。
 */
export async function* interpretDream(
  chart: UnifiedChart,
  dreamText: string,
  opts: SpiritOptions = {},
): AsyncGenerator<string> {
  const { text } = await generateDreamReply(chart, dreamText, opts);
  yield text;
}
