import type { Direction } from "@eamvp/core";
import type { FengshuiFacts } from "./facts";

/**
 * 风水侧反幻觉后置两道（EP-fs-06）。
 * 与既有 sanitizeReading / correctMutagens 同层：确定性兜底，不依赖模型自觉。
 */

/** 「传统象征」条目禁用的伪科学措辞。 */
const PSEUDO_SCIENCE = [
  "研究表明", "研究显示", "科学证明", "科学研究", "实验显示", "实验证明",
  "临床", "数据显示", "已被证实", "医学证明",
];

/** 命中该行属于「传统象征」语境的标记。 */
const SYMBOLIC_MARKERS = ["传统象征", "象征意义", "仪式"];

/**
 * 删除「传统象征」语境下出现的伪科学措辞。
 * 判定为逐行：该行含象征标记 或 含事实中任一传统象征条目的动作片段。
 */
export function sanitizeFengshui(markdown: string, facts: FengshuiFacts): string {
  const symbolicActions = facts.remedies
    .filter((r) => r.evidence === "传统象征")
    .map((r) => r.action.slice(0, 8))
    .filter(Boolean);

  return markdown
    .split("\n")
    .map((line) => {
      const isSymbolic =
        SYMBOLIC_MARKERS.some((m) => line.includes(m)) ||
        symbolicActions.some((a) => line.includes(a));
      if (!isSymbolic) return line;
      let out = line;
      for (const w of PSEUDO_SCIENCE) {
        // 连同其后的逗号/顿号一并去掉，避免留下断句
        out = out.replace(new RegExp(`${w}[，,、]?`, "g"), "");
      }
      return out;
    })
    .join("\n");
}

export type DirectionCorrection = {
  direction: Direction;
  label: string;
  wrote: string;
  correct: string;
};

const ALL_STARS = ["生气", "天医", "延年", "伏位", "绝命", "五鬼", "六煞", "祸害"];

/**
 * 方位一致性校验：八方吉凶来自查表，模型输出可机械对拍。
 * 匹配「<方位名><连接词><星名>」，连接词可为 为/是/属/的 或直接相连。
 *
 * ⚠️ 必须用**单趟组合正则**（一个 alternation 里放全部方位名，长名优先），
 * 不能对每个方位分别单独 `.replace()`：后者各自独立扫描「上一轮已被改写过」的
 * 文本，短名会吃进长名替换产物的尾部——例如「东南」先被纠正为「东南是生气」后，
 * 单字「南」的独立一趟又在这个替换结果里二次命中「南是生气」，把刚改对的又改错。
 * 长名优先排序只解决同一起点处「谁先试」，解决不了「短名事后吃掉长名替换产物」；
 * 单趟扫描对原文一次性做非重叠匹配，两个问题一起规避。
 */
export function verifyDirectionConsistency(
  markdown: string,
  facts: FengshuiFacts,
): { text: string; corrections: DirectionCorrection[] } {
  const corrections: DirectionCorrection[] = [];

  // 长名优先，避免「东」抢在「东南」前面被 alternation 选中
  const byLabel = [...facts.directions].sort((a, b) => b.label.length - a.label.length);
  const byLabelName = new Map(byLabel.map((d) => [d.label, d]));
  const pattern = new RegExp(
    `(${byLabel.map((d) => d.label).join("|")})(方|方位)?(为|是|属|系)?(${ALL_STARS.join("|")})`,
    "g",
  );

  const text = markdown.replace(pattern, (match, label, suffix, linker, star) => {
    const d = byLabelName.get(label)!;
    if (star === d.star) return match;
    corrections.push({ direction: d.direction, label: d.label, wrote: star, correct: d.star });
    return `${label}${suffix ?? ""}${linker ?? ""}${d.star}`;
  });

  return { text, corrections };
}
