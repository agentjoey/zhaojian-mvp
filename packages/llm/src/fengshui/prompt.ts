import { FENGSHUI_GUARDRAILS } from "@eamvp/core";
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

export function buildFengshuiUserPrompt(facts: FengshuiFacts, opts?: { nickname?: string }): string {
  const dirLines = [...facts.directions] // 必须先复制：sort 原地改数组，会永久打乱调用方 facts 的方位顺序
    .sort((a, b) => Number(b.auspicious) - Number(a.auspicious) || a.rank - b.rank)
    .map((d) => `- ${d.label}：${d.star}（${d.auspicious ? "吉" : "凶"}，第${d.rank}）`)
    .join("\n");
  const remLines = facts.remedies
    .map((r) => `- [${r.effort}][${r.evidence}] ${r.action}｜传统依据：${r.traditional}｜现代机制：${r.modern ?? "无（不得编造）"}`)
    .join("\n");
  return [
    `称呼：${opts?.nickname ?? "你"}`,
    `本命卦：${facts.mingGua}（${facts.guaGroup}）`,
    `八方判语：`,
    dirLines,
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
