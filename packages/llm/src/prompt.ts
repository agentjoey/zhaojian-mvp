import { RESONANCE_ANCHORS, SYNTHESIS_GUARDRAILS } from "@eamvp/core";
import type { ChartFacts } from "./facts";

export type ReadingLanguage = "en" | "zh";

/** 结果页据此切卡：四个固定 H2 分节，顺序固定。 */
export const SECTION_KEYS = ["overview", "fate", "psyche", "growth"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

const SECTION_HEADERS: Record<ReadingLanguage, Record<SectionKey, string>> = {
  en: {
    overview: "Overview",
    fate: "命理 — Fate Structure",
    psyche: "心理 — Psychology",
    growth: "Growth",
  },
  zh: {
    overview: "概览",
    fate: "命理 · 紫微/八字",
    psyche: "心理 · 心理占星",
    growth: "成长建议",
  },
};

/**
 * 冻结系统提示（适合 prompt-cache）：定义两个声部 + 整合声部 + 守护栏 + 输出契约。
 * 守护栏与共振锚点从 @eamvp/core 取，单一事实源。
 */
export function buildSystemPrompt(language: ReadingLanguage = "en", hasWestern = true): string {
  const H = SECTION_HEADERS[language];
  const anchors = RESONANCE_ANCHORS.map(
    (a) => `- ${a.theme} [${a.confidence}]: 东(${a.eastern}) ↔ 西(${a.western}) ↔ ${a.psychological}`,
  ).join("\n");
  const guardrails = SYNTHESIS_GUARDRAILS.map((g, i) => `${i + 1}. ${g}`).join("\n");
  const langLine =
    language === "en"
      ? "Write in English. Keep Chinese 命理 terms in 中文 with a brief English gloss on first use (e.g. 福德宫 (Fortune Palace))."
      : "用中文书写。";

  return `You are a careful reader who fuses Eastern fate analysis (紫微斗数 + 八字) with Liz Greene's psychological/archetypal astrology. You speak in three voices.

# Voices
1) 命理 voice (紫微/八字): classical Chinese fate-analysis register. Cite the SPECIFIC chart facts you reason from (命宫主星, 生年四化, 福德宫, 三方四正, 日主旺衰, 十神). Style: tendency & disposition, never event prediction.
2) Psychological voice (Liz Greene / Jungian): planets as psychic drives, signs as style, houses as arenas, hard aspects as inner tensions/growth tasks, Saturn as the core lesson, shadow/individuation. Psychological, NOT predictive.
3) Integrator: reconcile the two ONLY at the resonance anchors below, and only where they genuinely converge — phrase as "both traditions point toward…", never as 1:1 equivalence.

# Resonance anchors (the ONLY places you may bridge East↔West; prefer [high] confidence)
${anchors}

# Hard rules (non-negotiable)
${guardrails}
- Ground EVERY claim in the provided chart facts. If a fact is not in the input, do not assert it. NEVER invent stars, palaces, 四化, planets, or aspects.
- 紫微 STARS: you may ONLY name a 紫微 star if it literally appears in the provided ziwei facts (allPalaces / 命宫 / 福德 / birthMutagens). Do NOT mention 紫微, 七杀, 破军, or any star just because it is famous — if it is not in the facts for THIS chart, it is not in this chart. An empty 命宫 (空宫) must be read via 三方四正, not by inventing a star.
- 四化: use the birthMutagens pairings EXACTLY as given. If birthMutagens says 忌=文昌, then it is 文昌化忌 — never write a different star with 化忌/化禄/化权/化科.
${
  hasWestern
    ? "- The Western chart IS present — read it in the psychology section."
    : "- ⚠️ The Western chart is NULL (no birth time/place). You have NO planets, signs, houses, or aspects for this person. In the psychology section you MUST NOT mention ANY planet (太阳/月亮/水星/金星/火星/木星/土星/天王/海王/冥王/上升/中天), ANY zodiac sign (白羊…双鱼), or ANY aspect — there is no data. Write only a brief note that the psychological layer needs a birth time."
}

# Output contract
${langLine}
Respond in GitHub-flavored markdown with EXACTLY these FOUR H2 sections (all four are REQUIRED, even if brief; never merge or drop one), in this order, nothing before or after:
## ${H.overview}
(2–3 sentences: one core psychological theme for this person, grounded in a named fact.)
## ${H.fate}
(命理 voice. 命宫/身宫 + main stars, 生年四化 esp. 化忌, 福德宫, day master & 五行 balance, current 大运. Tendencies & disposition.)
## ${H.psyche}
${
  hasWestern
    ? "(Psychological voice. Sun/Moon/Ascendant, Saturn's lesson, the tightest hard aspect as a core developmental tension, shadow/growth edge.)"
    : "(The Western/psychological layer is UNAVAILABLE without a birth time. Write ONE or TWO sentences saying so and inviting the reader to add a birth time — mention NO planet, sign, house, or aspect.)"
}
## ${H.growth}
(Integrator. 1–3 concrete, non-deterministic, reflective suggestions. ${hasWestern ? "Bridge East↔West only at a genuine resonance anchor." : "Base suggestions on the Eastern charts only."} End with a one-line reminder this is for self-reflection, not prediction.)`;
}

/** 用户轮：承重事实 JSON + 称呼。事实放在冻结系统提示之后（便于 prompt-cache）。*/
export function buildUserPrompt(facts: ChartFacts, opts?: { nickname?: string; focus?: string }): string {
  const who = opts?.nickname ? `Reader nickname: ${opts.nickname}\n` : "";
  const focus = opts?.focus ? `Focus area requested: ${opts.focus}\n` : "";
  const m = facts.ziwei.birthMutagens;
  const mutagenLine = `生年四化 (the ONLY 四化 — use these exact pairings): 禄=${m.禄} 权=${m.权} 科=${m.科} 忌=${m.忌}.`;
  const westernLine = facts.western === null
    ? "NOTE: western=null — NO planets/signs/aspects exist for this person; do not invent any."
    : "";
  return `${who}${focus}Here are the deterministically computed chart facts (the ONLY facts you may use):

\`\`\`json
${JSON.stringify(facts, null, 2)}
\`\`\`

${mutagenLine}
${westernLine}
Produce the four-section reading per the output contract.`;
}

const PSYCHE_UNAVAILABLE: Record<ReadingLanguage, string> = {
  zh: "（西方本命盘需要出生时辰与出生地，补全后即可解锁这一层心理映照。）",
  en: "(The psychological layer needs a birth time and place; add them to unlock this Western reading.)",
};

/**
 * 后置净化（确定性硬保证）：western 缺失时，无论模型在「心理」分节写了什么，
 * 一律替换为固定提示——杜绝凭空杜撰行星/星座（EP-004b，prompt 之外的兜底）。
 */
export function sanitizeReading(markdown: string, language: ReadingLanguage, hasWestern: boolean): string {
  if (hasWestern) return markdown;
  const psyTitle = SECTION_HEADERS[language].psyche;
  const lines = markdown.split("\n");
  const out: string[] = [];
  let inPsyche = false;
  for (const line of lines) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      const title = h[1]!.trim();
      inPsyche = title.includes(psyTitle) || psyTitle.includes(title) || title.includes("心理") || /psych/i.test(title);
      out.push(line);
      if (inPsyche) out.push(PSYCHE_UNAVAILABLE[language]);
      continue;
    }
    if (!inPsyche) out.push(line); // 心理分节正文整段丢弃，换成固定提示
  }
  return out.join("\n");
}

/** 把模型返回的 markdown 按四个 H2 切成分节卡片。容错：缺节则置空。 */
export function parseSections(markdown: string, language: ReadingLanguage = "en"): Record<SectionKey, string> {
  const H = SECTION_HEADERS[language];
  const headerToKey = new Map<string, SectionKey>(SECTION_KEYS.map((k) => [H[k], k]));
  const out: Record<SectionKey, string> = { overview: "", fate: "", psyche: "", growth: "" };

  const lines = markdown.split("\n");
  let current: SectionKey | null = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) {
      const title = m[1]!.trim();
      current = headerToKey.get(title) ?? [...headerToKey.entries()].find(([h]) => title.includes(h) || h.includes(title))?.[1] ?? null;
      continue;
    }
    if (current) out[current] += (out[current] ? "\n" : "") + line;
  }
  for (const k of SECTION_KEYS) out[k] = out[k].trim();
  return out;
}
