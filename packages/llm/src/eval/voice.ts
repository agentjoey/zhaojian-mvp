import type { ReadingLanguage } from "../prompt";

/**
 * 风格回归检查器（EP-spirit-voice · C）—— 纯函数、无 LLM 依赖。
 *
 * 机械核对 buildSpiritSystemPrompt「How you speak」里的硬规则：
 *   1) 句数（默认 ≤3；对方明确要求展开时 ≤6；解梦场景 ≤12）
 *   2) 长度（中文 ≤120 字 / 英文 ≤80 词；allowLong 放宽到 ≤300 字 / ≤200 词；dreamMode 独立放宽到 ≤500 字 / ≤320 词）
 *   3) 禁用词命中（中英双版清单 + 语气词堆砌）
 *   4) 问句结尾（默认不以问句收尾）
 *   5) 锚点事实复引（同一锚点关键词在上一轮灵回应里已出现过）
 * 阈值与 prompt 里的硬规则保持一致，改规则时必须同步改这里。
 */

export type VoiceViolation = { rule: string; detail: string };

export type VoiceOptions = {
  language: ReadingLanguage;
  /** 对方明确要求展开（「详细说」「为什么」/"tell me more" 等）：6 句 + 长字数档 */
  allowLong?: boolean;
  /** 解梦场景（显式展开）：12 句 + dream 独立字数档（500 字 / 320 词，EP-dream-05） */
  dreamMode?: boolean;
  /** 本轮之前灵已说过的回应（用于锚点事实复引检测） */
  previousSpiritReplies?: string[];
  /** 灵的锚点事实标签（deriveSpirit persona.anchorFacts） */
  anchorFacts?: string[];
};

export const VOICE_LIMITS = {
  sentencesShort: 3,
  sentencesLong: 6,
  sentencesDream: 12,
  zhChars: 120,
  enWords: 80,
  zhCharsLong: 300,
  enWordsLong: 200,
  zhCharsDream: 500,
  enWordsDream: 320,
} as const;

export const BANNED_ZH = [
  "首先", "其次", "总而言之", "综上",
  "我理解你的感受", "作为你的本命之灵", "值得注意的是", "让我们一起",
] as const;

export const BANNED_EN = [
  "Firstly", "Moreover", "In conclusion",
  "I understand how you feel", "As your natal spirit", "It's worth noting that",
] as const;

/** 语气词堆砌：同一句里 呢/哦/呀 出现两次及以上。 */
const PARTICLE_PILEUP = /[呢哦呀].*[呢哦呀]/;

/** 按句切分：中文按 。！？…，英文按 .!?；换行也算断句。 */
function splitSentences(text: string): string[] {
  return (text.match(/[^。！？!?….\n]+[。！？!?…]*/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function zhCharCount(text: string): number {
  return text.replace(/\s/g, "").length;
}

function enWordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** 锚点事实里的「承重关键词」：拉丁词（≥3 字母、去通用词）与连续中文段。 */
const ANCHOR_STOPWORDS = new Set([
  "chart", "ruler", "the", "inner", "tension", "of", "in", "your", "stars", "palace",
  "soul", "fortune", "learning", "to", "hold", "own", "contradictions", "pull", "and", "with",
]);

export function anchorKeyTerms(anchorFacts: string[]): string[] {
  const terms: string[] = [];
  for (const f of anchorFacts) {
    for (const m of f.matchAll(/[A-Za-z]{3,}|[一-鿿]+/g)) {
      const t = m[0];
      if (/^[A-Za-z]/.test(t) && ANCHOR_STOPWORDS.has(t.toLowerCase())) continue;
      // 单字中文段（宫/星/忌…）是通用构词不是锚点——「官禄宫/兄弟宫」都含「宫」，
      // 保留它会把每条正常回应都误报成复引（probe:voice 实证假阳性）
      if (/^[一-鿿]$/.test(t)) continue;
      terms.push(t);
    }
  }
  return [...new Set(terms)];
}

/** 机械检查一条灵的回应，返回违规列表（空数组 = 通过）。 */
export function checkVoice(text: string, opts: VoiceOptions): VoiceViolation[] {
  const violations: VoiceViolation[] = [];
  const zh = opts.language === "zh";
  const sentences = splitSentences(text);
  const maxSentences = opts.dreamMode
    ? VOICE_LIMITS.sentencesDream
    : opts.allowLong
      ? VOICE_LIMITS.sentencesLong
      : VOICE_LIMITS.sentencesShort;

  // 1) 句数
  if (sentences.length > maxSentences) {
    violations.push({
      rule: "sentence-count",
      detail: `${sentences.length} 句，超过上限 ${maxSentences} 句${opts.allowLong || opts.dreamMode ? "（已放宽）" : ""}`,
    });
  }

  // 2) 长度
  if (zh) {
    const n = zhCharCount(text);
    const maxChars = opts.dreamMode
      ? VOICE_LIMITS.zhCharsDream
      : opts.allowLong
        ? VOICE_LIMITS.zhCharsLong
        : VOICE_LIMITS.zhChars;
    if (n > maxChars) {
      violations.push({ rule: "length", detail: `${n} 字，超过上限 ${maxChars} 字` });
    }
  } else {
    const n = enWordCount(text);
    const maxWords = opts.dreamMode
      ? VOICE_LIMITS.enWordsDream
      : opts.allowLong
        ? VOICE_LIMITS.enWordsLong
        : VOICE_LIMITS.enWords;
    if (n > maxWords) {
      violations.push({ rule: "length", detail: `${n} words, over the ${maxWords}-word cap` });
    }
  }

  // 3) 禁用词 / 语气词堆砌
  if (zh) {
    for (const phrase of BANNED_ZH) {
      if (text.includes(phrase)) {
        violations.push({ rule: "banned-phrase", detail: `命中禁用词「${phrase}」` });
      }
    }
    for (const s of sentences) {
      if (PARTICLE_PILEUP.test(s)) {
        violations.push({ rule: "banned-phrase", detail: `语气词堆砌：「${s}」` });
      }
    }
  } else {
    const lower = text.toLowerCase();
    for (const phrase of BANNED_EN) {
      if (lower.includes(phrase.toLowerCase())) {
        violations.push({ rule: "banned-phrase", detail: `banned phrase: "${phrase}"` });
      }
    }
  }

  // 4) 问句结尾
  if (/[?？]["'」』)]*\s*$/.test(text)) {
    violations.push({ rule: "question-ending", detail: "以问句结尾（默认规则禁止）" });
  }

  // 5) 锚点事实复引：当前回应引用的锚点关键词在既往灵回应里已出现过
  const anchors = opts.anchorFacts ?? [];
  const previous = opts.previousSpiritReplies ?? [];
  if (anchors.length && previous.length) {
    const repeated = anchorKeyTerms(anchors).filter(
      (t) => text.includes(t) && previous.some((p) => p.includes(t)),
    );
    if (repeated.length) {
      violations.push({ rule: "anchor-repeat", detail: `重复引用锚点事实：${repeated.join("、")}` });
    }
  }

  return violations;
}
