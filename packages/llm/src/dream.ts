import type { ReadingLanguage } from "./prompt";
import type { UnifiedChart } from "@eamvp/core";
import { deriveSpirit } from "@eamvp/core";
import { extractFacts } from "./facts";
import { sanitizeReading } from "./prompt";
import { correctMutagens } from "./correct";
import { chat, chatStream, type ChatMessage } from "./client";
import { resolveLlmConfig, isLlmConfigured } from "./provider";
import { buildSpiritSystemPrompt, stripSpiritScaffolding, type SpiritOptions, type SpiritTurn } from "./spirit";

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
// 需要完整文本，流式逐行吐会让「被剥的预言句」先被用户看到；≤500 字等待可控（EP-dream-05 篇幅放宽后的数字）。

export const DREAM_MAX_CHARS = 2000;

const DREAM_RULES_ZH = `

# 解梦规则（对方讲述的是梦境时适用）
- 按四拍走，一段自然口语走完：不用标题、不分节、不列表——① 你的直观（1–2 句）；② 这个梦在说什么：挑梦里一个具体的意象或动作（不是整个梦），把它当作一次投射来问——这个意象可能在替这个人的哪部分自己、或者现实处境说话？用你已知的这个人（记忆/自陈/核心张力）来判断该往哪个方向问，而不是替这个意象定死答案。区分「这类意象通常关联什么」（文化通识，不确定）和「这个梦对这个人可能在说什么」（贴着这个人来猜，仍是猜测但更贴身）——两层都提一点，比一次性给结论更真实；③ 传统说法（有才有，且必须带「民间说法里/传统上认为」这类标注，只作文化参照）；④ 一个邀请（一句，具体可执行）。
- 文风自检：写完通读一遍草稿——凡是靠「先否定一个常见读法、再端出真正答案」制造洞见感的对照句式，改掉它，直接陈述你的判断——全篇至多允许一处否定—肯定的对照，第二处起一律改写；凡是把三个近义词并排堆起来的写法，删掉只留最准的那个。宁可写得笨拙具体，也不要写得工整好看。
- 禁用预言措辞：预示着/将会/凶兆/吉兆/主灾/主吉（第③拍且有标注时除外）。梦中出现死亡、疾病、血光，一律不作预兆解读，只作心理映照。
- 噩梦或痛苦内容：先接住情绪，再给解读；不做医疗或心理诊断。
- 长度：不超过 12 句、500 字（这是留余量的目标，写完超了就删，宁短勿长）。命盘事实至多引一处，且要真正融进②的判断依据里、不是贴标签；默认不以问句结尾。`;

const DREAM_RULES_EN = `

# Dream-reading rules (when they share a dream)
- Four beats in ONE natural spoken paragraph — no headings, no sections, no lists: ① your immediate impression (1–2 sentences); ② what this dream may be processing — pick ONE concrete image or action from the dream (not the whole dream) and read it as a projection: which part of this person, or which part of their waking situation, might this image be speaking for? Use what you know of them (memory/self-report/core tension) to judge WHICH direction to ask in — don't pin the image to a fixed meaning. Name both registers briefly: what this kind of image commonly evokes (cultural, uncertain) AND what this dream might be saying for THIS person specifically (grounded, still a guess, but a closer one) — naming both is more honest than a single flat conclusion; ③ folk tradition (only if relevant, and ALWAYS marked "folk saying"/"traditionally", as cultural reference only); ④ one invitation (one concrete sentence).
- Style self-check: read your draft once before finishing. Never manufacture insight by negating-then-crowning (dismissing a common reading to present "the real one") — just state your judgment directly; at most ONE such construction per reply, rewrite any further ones. Never stack three near-synonyms side by side — keep the single truest word. Write something a little clumsy and specific rather than something polished and generic.
- No prediction wording: "foretells", "omen", "will come true", "means you will" (except in beat ③ with a marker). Death, illness, blood in a dream: never read as omen — psychological reflection only.
- Nightmares or painful content: hold the feeling first, then interpret; no medical or psychological diagnosis.
- Length: at most 12 sentences / 320 words (a target with margin — trim if over; shorter is better). At most ONE chart fact — and it must actually drive beat ②'s reasoning, not be a label dropped in for its own sake. Do not end with a question by default.`;

/** system 提示 + 首轮 user 消息（含命盘事实 + 梦原文）——generateDreamReply 与 continueDreamReply 共用，避免两处 prompt 措辞跑偏。 */
function buildDreamPrompt(chart: UnifiedChart, dreamText: string, opts: SpiritOptions) {
  const language = opts.language ?? "en";
  const zh = language === "zh";
  const persona = deriveSpirit(chart);
  const facts = extractFacts(chart);
  const system = buildSpiritSystemPrompt(persona, chart, language, opts) + (zh ? DREAM_RULES_ZH : DREAM_RULES_EN);
  const factsBlock = `\`\`\`json\n${JSON.stringify(facts, null, 2)}\n\`\`\``;
  const firstUser = zh
    ? `以下是确定性算出的命盘事实（你只能引用这些）：\n\n${factsBlock}\n\n对方讲述了一个梦：\n\n「${dreamText}」\n\n请以「本命之灵」的身份、用简体中文、按解梦规则回应这个梦。`
    : `Here are the deterministically computed chart facts (the ONLY facts you may use):\n\n${factsBlock}\n\nThey shared a dream:\n\n"${dreamText}"\n\nRespond as their 本命之灵, following the dream-reading rules.`;
  return { system, firstUser, language, zh };
}

/** 后置链共用：脚手架护栏 → sanitizeReading → sanitizeDream → correctMutagens → fallback。 */
function finalizeDreamOutput(
  raw: string,
  language: ReadingLanguage,
  chart: UnifiedChart,
  fallbackText: string,
): { text: string; stripped: string[] } {
  let out = stripSpiritScaffolding(raw);
  out = sanitizeReading(out, language, chart.western !== null);
  const scan = sanitizeDream(out, language);
  out = scan.text;
  out = correctMutagens(out, chart.ziwei.birthMutagens).text;
  if (out.length < 6) out = fallbackText;
  return { text: out, stripped: scan.stripped };
}

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
  const dream = dreamText.trim();
  if (!dream) throw new Error("梦境内容为空");
  if (dream.length > DREAM_MAX_CHARS) throw new Error(`梦境内容过长（>${DREAM_MAX_CHARS} 字）`);

  const { system, firstUser, language, zh } = buildDreamPrompt(chart, dream, opts);
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: firstUser },
  ];

  // 500 字中文 ≈ 900-1100 token（EP-dream-05：篇幅上限从 300 字放宽到 500 字后同步调整，
  // 原 700 是对齐旧上限 300 字算的，不动这里会截断深化后的输出）。
  const stream = chatStream(cfg, messages, { signal: opts.signal, maxTokens: 1200 });
  let all = "";
  for await (const chunk of stream) all += chunk;

  const result = finalizeDreamOutput(
    all,
    language,
    chart,
    zh ? "我在。这个梦先放在这里——再说一遍给我听，好吗？" : "I'm here. Let's set this dream down for a moment — tell it to me again?",
  );
  console.info(`[dream] model=${cfg.model} chars=${result.text.length} stripped=${result.stripped.length}`);
  return result;
}

/**
 * 解梦追问（EP-dream-history）：同一次解梦对话内的多轮追问——system/首轮 prompt 与
 * generateDreamReply 完全一致（解梦规则持续生效，追问不会跳出「不占卜」的护栏），
 * 只是把已发生的对话（灵的首次解读 + 之后的往返）接着喂回去。
 *
 * `priorTurns` 从「灵的第一条解读」开始（不含用户的梦原文——梦原文由 dreamText 单独
 * 传入，用来重建首轮 prompt），之后按 spirit/user 交替。这些对话只活在浏览器会话内、
 * 随请求体传来即用即弃——服务端不落库（落库的只有 EP-dream-history 的摘要）。
 */
export async function continueDreamReply(
  chart: UnifiedChart,
  dreamText: string,
  priorTurns: SpiritTurn[],
  followUp: string,
  opts: SpiritOptions = {},
): Promise<{ text: string; stripped: string[] }> {
  const cfg = opts.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：请设置 LLM_API_KEY。");
  const dream = dreamText.trim();
  if (!dream) throw new Error("梦境内容为空");
  const q = followUp.trim();
  if (!q) throw new Error("追问内容为空");
  if (q.length > DREAM_MAX_CHARS) throw new Error(`追问内容过长（>${DREAM_MAX_CHARS} 字）`);

  const { system, firstUser, language, zh } = buildDreamPrompt(chart, dream, opts);
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: firstUser },
    ...priorTurns.map((t): ChatMessage => ({ role: t.role === "user" ? "user" : "assistant", content: t.content })),
    { role: "user", content: q },
  ];

  // EP-dream-05：追问复用与首轮相同的 DREAM_RULES（12 句/500 字目标），700 会截断——
  // 与 generateDreamReply 同一处调整，见那边的 maxTokens 注释。
  const stream = chatStream(cfg, messages, { signal: opts.signal, maxTokens: 1200 });
  let all = "";
  for await (const chunk of stream) all += chunk;

  const result = finalizeDreamOutput(
    all,
    language,
    chart,
    zh ? "我在。能再说说你想问的是哪部分吗？" : "I'm here. Could you say more about what you'd like to ask?",
  );
  console.info(`[dream:follow-up] model=${cfg.model} chars=${result.text.length} stripped=${result.stripped.length}`);
  return result;
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

/**
 * 解梦历史条目摘要（EP-dream-history）：只为「最近 10 条」列表生成一句极简 gist，
 * 与 summarizeSpiritMemory 同一条隐私红线（无 PII）但更严：不是转述关切，而是明确
 * 禁止逐字复述梦境——spec §5.1「梦原文不落库」的边界是「原文」，摘要只能是第三人称
 * 转述的主题句，读起来像一句标签，不是梦的副本。
 */
const DREAM_SUMMARY_MAX_CHARS = 160;

export async function summarizeDreamEntry(
  dreamText: string,
  replyText: string,
  opts: SpiritOptions = {},
): Promise<string> {
  const cfg = opts.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：请设置 LLM_API_KEY。");
  const zh = (opts.language ?? "en") === "zh";

  const system = zh
    ? `你在为一次「解梦」对话生成一句极简标签，供用户以后在历史列表里认出这是哪次解梦。规则：不超过 30 字；只能是第三人称转述的梦的主题（例如「一个关于坠落的梦」），绝不逐字复述梦境原文或引用具体细节；不含姓名、生日、坐标、具体地点等个人信息；不做吉凶/预言判断；只输出这一句话，不要引号、不要前缀。`
    : `Write one ultra-short label (English, at most 15 words) so the user can later recognize this dream session in a history list. Rules: third-person paraphrase of the dream's theme ONLY (e.g. "a dream about falling") — never quote the dream verbatim or repeat specific details; no names, birthdates, coordinates, or exact locations; no fortune-telling/prediction language. Output only that one sentence — no quotes, no prefix.`;
  const user = zh
    ? `梦境（仅供你概括主题，不要逐字复述）：${dreamText.slice(0, 400)}\n\n灵的解读要点：${replyText.slice(0, 400)}`
    : `Dream (summarize the theme only, do not quote it back): ${dreamText.slice(0, 400)}\n\nKey point from the interpretation: ${replyText.slice(0, 400)}`;

  const raw = await chat(cfg, [{ role: "system", content: system }, { role: "user", content: user }], { signal: opts.signal, maxTokens: 80 });
  return raw.trim().replace(/^["「『]|["」』]$/g, "").slice(0, DREAM_SUMMARY_MAX_CHARS);
}
