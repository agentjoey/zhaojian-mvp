import { FENGSHUI_GUARDRAILS } from "@eamvp/core";
import type { ObjectAdvice } from "@eamvp/core";
import type { ReadingLanguage } from "../prompt";
import type { FengshuiFacts } from "./facts";

export const FENGSHUI_SECTION_KEYS = ["situation", "youAndSpace", "actions"] as const;
export type FengshuiSectionKey = (typeof FENGSHUI_SECTION_KEYS)[number];

const SECTION_HEADERS: Record<ReadingLanguage, Record<FengshuiSectionKey, string>> = {
  zh: { situation: "形势", youAndSpace: "境与你", actions: "可做的事" },
  en: { situation: "The Layout", youAndSpace: "You and Your Space", actions: "What You Can Do" },
};

export function buildFengshuiSystemPrompt(language: ReadingLanguage = "zh"): string {
  const H = SECTION_HEADERS[language];
  const langLine = language === "zh" ? "全文用简体中文。" : "Write the whole answer in English.";
  return [
    "你是 Mira 的「境」声部 —— 谈人与居住空间的关系。你的材料全部由确定性计算层给出。",
    "",
    "【硬规则】",
    ...FENGSHUI_GUARDRAILS.map((g, i) => `${i + 1}. ${g}`),
    `${FENGSHUI_GUARDRAILS.length + 1}. 方位吉凶只能照用给定事实中的星名（生气/天医/延年/伏位/绝命/五鬼/六煞/祸害），不得自行推算、不得改写某方位对应的星。`,
    `${FENGSHUI_GUARDRAILS.length + 2}. 化解条目标注为「传统象征」的，只讲传统怎么说 + 这件事作为一种安顿自己的仪式意味着什么；禁止使用「研究表明」「科学证明」「临床」「实验显示」等措辞。`,
    `${FENGSHUI_GUARDRAILS.length + 3}. 「本命八方」由命卦定、「房屋八方」由宅卦定，是两套彼此独立的判语，**不得混用或互相推导**。谈某个方位时必须说清是哪一套。`,
    "",
    "【输出格式】严格三个 H2 分节，顺序固定，不加其他标题：",
    `## ${H.situation}`,
    "客观交代命卦、所属东西四命、八方各自的星与吉凶。像陈述地形，不下判词。",
    `## ${H.youAndSpace}`,
    "把上面的形势翻译成日常体验：哪些方位久待更容易松弛、哪些更容易紧绷，并给出对应的现代解释（仅限事实中标注了现代机制的条目）。",
    `## ${H.actions}`,
    "列 4–6 条可做的事，零成本的排前面。每条写成一句可执行的动作；候选化解里标注为「传统象征」的条目，必须在对应这一条的行内加注「（传统象征）」，一条都不能漏标——这是后置净化据以判断语境的强制标记，不是可选装饰。",
    "",
    langLine,
    "结尾用一句话说明：这些是关于自我觉察与居住体验的建议，不构成专业意见。",
  ].join("\n");
}

/**
 * 把一组方位判语排成提示行：吉方在前、同吉凶内按 rank 升序。
 *
 * ⚠️ `[...sectors]` 的复制不能省。`Array.prototype.sort` 是**原地**排序，
 * 直接排会永久打乱调用方 `facts` 里那个数组的顺序——而 facts 在本项目是
 * 「算一次、下游只读」的东西。波 1 曾栽在这里，有专门测试锁定。
 *
 * 本命八方与房屋八方共用本函数，但它们是两套彼此独立的判语，
 * 只是**呈现格式**相同，语义上不可互推（见 system prompt 的硬规则）。
 */
function formatSectorLines(sectors: FengshuiFacts["directions"]): string[] {
  return [...sectors]
    .sort((a, b) => Number(b.auspicious) - Number(a.auspicious) || a.rank - b.rank)
    .map((d) => `- ${d.label}：${d.star}（${d.auspicious ? "吉" : "凶"}，第${d.rank}）`);
}

export function buildFengshuiUserPrompt(facts: FengshuiFacts, opts?: { nickname?: string }): string {
  const dirLines = formatSectorLines(facts.directions).join("\n");
  const remLines = facts.remedies
    .map((r) => `- [${r.effort}][${r.evidence}] ${r.action}｜传统依据：${r.traditional}｜现代机制：${r.modern ?? "无（不得编造）"}`)
    .join("\n");
  // Layer 1 专属：居所与宅八方。宅八方与上面的本命八方是两套独立判语（各自由命卦/宅卦定），
  // 不得混用，故标题里显式互相点名提醒。排序与格式化走 formatSectorLines（内含必要的复制）。
  const dwellingBlock = facts.dwelling ? [
    ``,
    `居所：${facts.dwelling.name}（${facts.dwelling.kind === "home" ? "住宅" : "办公"}，${facts.dwelling.tenancy === "rent" ? "租住" : "自有"}）`,
    `坐向：坐${facts.dwelling.sittingLabel}向${facts.dwelling.facingLabel} → ${facts.dwelling.guaName}宅（${facts.dwelling.group}）`,
    `与你：${facts.dwelling.matchWithPerson}`,
    `房屋八方判语（与上面的本命八方是两套，勿混用）：`,
    ...formatSectorLines(facts.dwelling.sectors),
  ] : [];

  const cohabBlock = facts.cohabitants.length ? [
    ``,
    `同住人（同一套房子对每个人吉凶不同，这是八宅的直接结论，不要说成"因人而异的感受"）：`,
    ...facts.cohabitants.map((c) =>
      `- ${c.name}：${c.mingGua}（${c.group}）｜对你吉但对 TA 凶：${c.conflicts.join("、") || "无"}｜双方皆吉：${c.sharedGood.join("、") || "无"}`),
  ] : [];
  return [
    `称呼：${opts?.nickname ?? "你"}`,
    `本命卦：${facts.mingGua}（${facts.guaGroup}）`,
    `本命八方判语：`,
    dirLines,
    ...dwellingBlock,
    ...cohabBlock,
    ``,
    `命局喜用五行：${facts.favorableElements.join("、") || "中和，无明显扶抑"}`,
    `命局所忌五行：${facts.unfavorableElements.join("、") || "无"}`,
    `有利方位：${facts.favorableDirections.join("、") || "无"}`,
    `宜用色：${facts.favorableColors.join("、") || "无"}｜宜用材：${facts.favorableMaterials.join("、") || "无"}｜宜少用色：${facts.unfavorableColors.join("、") || "无"}`,
    ``,
    `候选化解（只准从这些里挑，可合并同类，不得新增）：`,
    remLines,
  ].join("\n");
}

/** 按三个 H2 切分节，缺节置空（容错，与 parseSections 同策略）。 */
export function parseFengshuiSections(
  markdown: string,
  language: ReadingLanguage = "zh",
): Record<FengshuiSectionKey, string> {
  const H = SECTION_HEADERS[language];
  const out: Record<FengshuiSectionKey, string> = { situation: "", youAndSpace: "", actions: "" };
  let current: FengshuiSectionKey | null = null;
  for (const line of markdown.split("\n")) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) {
      const title = m[1]!.trim();
      current = FENGSHUI_SECTION_KEYS.find((k) => title.includes(H[k]) || H[k].includes(title)) ?? null;
      continue;
    }
    if (current) out[current] += line + "\n";
  }
  // 与既有 parseSections 一致：逐节 trim，别把首尾空行推给渲染方
  for (const k of FENGSHUI_SECTION_KEYS) out[k] = out[k].trim();
  return out;
}

/**
 * 物件顾问说人话层（EP-fs-04）的 system prompt。与 {@link buildFengshuiSystemPrompt}
 * 同样做法：硬规则复用 core 的 {@link FENGSHUI_GUARDRAILS}（单一事实源，导入+展开，
 * 不手写删减版），在此基础上叠加物件建议特有的约束（只准用给定方位、不得新增方位、
 * 不得断言吉凶后果、短输出）。
 *
 * `language="en"` 分支**不是**「中文提示后面加一句 answer in English」——本模块自撰
 * 的框架句与物件专属约束本身就是用英文写的（Task 11 复审必修1）；只有 core 的
 * `FENGSHUI_GUARDRAILS` 原文保持中文，因为它是被复用的单一事实源，不在本模块翻译
 * 范围内（core 也没有对应的英文版本，翻译等于自建一份分叉，与"单一事实源"矛盾）。
 */
export function buildObjectAdviceSystemPrompt(language: ReadingLanguage = "zh"): string {
  const guardrails = FENGSHUI_GUARDRAILS.map((g, i) => `${i + 1}. ${g}`);
  const n = FENGSHUI_GUARDRAILS.length;

  if (language === "en") {
    return [
      "You are the \"Space\" voice of Mira, giving brief, spoken-language placement advice for a single object.",
      "",
      "Hard rules:",
      ...guardrails,
      `${n + 1}. Only use the directions and rules given below — do not invent or add any direction beyond the given facts.`,
      `${n + 2}. Do not assert fated outcomes (e.g. "this will bring wealth" or "this will cause illness") — describe tendencies and everyday experience only.`,
      "",
      "Write the given conclusion as 2–3 natural sentences, plain, actionable, and non-deterministic.",
      "Output ONLY those 2–3 sentences — no heading, prefix, or extra explanation.",
      "Write the whole answer in English.",
    ].join("\n");
  }

  return [
    "你是 Mira 的「境」声部——为单件物件的摆放给出简短建议。",
    "",
    "【硬规则】",
    ...guardrails,
    `${n + 1}. 只准使用给定的方位与规则作答，不得自行推算或新增给定事实之外的方位。`,
    `${n + 2}. 不得断言吉凶后果（如「摆这里会招财/破财/生病」），只描述倾向与日常体验。`,
    "",
    "把给定的结论写成 2–3 句自然中文，口吻平实、可执行、非决定论。",
    "只输出这 2–3 句本身，不加标题、前后缀或额外说明。",
    "全文用简体中文。",
  ].join("\n");
}

/** 物件顾问说人话层的 user prompt：给定结论 + 称呼，不含 language —— 与 {@link buildFengshuiUserPrompt} 一致，事实数据本身不随目标语言变化，由 system prompt 里的语言指令统一控制输出语言。 */
export function buildObjectAdviceUserPrompt(advice: ObjectAdvice, opts?: { nickname?: string }): string {
  return [
    `称呼：${opts?.nickname ?? "你"}`,
    `物件：${advice.categoryLabel}`,
    `五行：${advice.elementOfObject ?? "未定"}`,
    `推荐方位：${advice.recommendedDirections.map((r) => `${r.label}（${r.reason}）`).join("；") || "无"}`,
    `不宜方位：${advice.avoid.map((r) => `${r.label}（${r.reason}）`).join("；") || "无"}`,
    `品类规则：${advice.categoryRules.join("；")}`,
    `与命主关系：${advice.personalFit}`,
    advice.intendedVerdict
      ? `用户想放在：${advice.intendedVerdict.direction}，该方为${advice.intendedVerdict.star}（${advice.intendedVerdict.auspicious ? "吉" : "凶"}）`
      : "",
  ].filter(Boolean).join("\n");
}
