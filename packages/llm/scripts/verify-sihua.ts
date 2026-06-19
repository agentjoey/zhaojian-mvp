/**
 * 四化根因分析：核对引擎算出的 birthMutagens 是否与「天干四化」标准表一致。
 * 一致 → 规则引擎正确，prose 里的「紫微化忌」等是模型幻觉，非引擎问题。
 */
import { computeUnifiedChart, BirthInputSchema } from "@eamvp/core";
import { EVAL_CASES } from "../src/index";

// 标准天干四化表（年干 → 禄/权/科/忌），见 research/ziwei-doushu-knowledge.md §4
const TABLE: Record<string, { 禄: string; 权: string; 科: string; 忌: string }> = {
  甲: { 禄: "廉贞", 权: "破军", 科: "武曲", 忌: "太阳" },
  乙: { 禄: "天机", 权: "天梁", 科: "紫微", 忌: "太阴" },
  丙: { 禄: "天同", 权: "天机", 科: "文昌", 忌: "廉贞" },
  丁: { 禄: "太阴", 权: "天同", 科: "天机", 忌: "巨门" },
  戊: { 禄: "贪狼", 权: "太阴", 科: "右弼", 忌: "天机" },
  己: { 禄: "武曲", 权: "贪狼", 科: "天梁", 忌: "文曲" },
  庚: { 禄: "太阳", 权: "武曲", 科: "太阴", 忌: "天同" },
  辛: { 禄: "巨门", 权: "太阳", 科: "文曲", 忌: "文昌" },
  壬: { 禄: "天梁", 权: "紫微", 科: "左辅", 忌: "武曲" },
  癸: { 禄: "破军", 权: "巨门", 科: "太阴", 忌: "贪狼" },
};

let mismatch = 0;
for (const c of EVAL_CASES) {
  const chart = computeUnifiedChart(BirthInputSchema.parse(c.input));
  const yearStem = chart.bazi.pillars.year.stem;
  const expect = TABLE[yearStem]!;
  const got = chart.ziwei.birthMutagens;
  const diffs = (["禄", "权", "科", "忌"] as const).filter((k) => expect[k] !== got[k]);
  const tag = diffs.length ? `❌ 差异 ${diffs.map((k) => `${k}:表=${expect[k]}/引擎=${got[k]}`).join(" ")}` : "✓";
  if (diffs.length) mismatch++;
  console.log(`${tag}  ${c.id.padEnd(20)} 年干${yearStem}  引擎四化 禄${got.禄}/权${got.权}/科${got.科}/忌${got.忌}`);
}
console.log(`\n结论：${mismatch === 0 ? "引擎 birthMutagens 与标准表 100% 一致 → 四化错配是【模型幻觉】，非规则引擎问题。" : `${mismatch} 例不一致 → 需查引擎。`}`);
console.log("注：「紫微化忌」在任何流派都不存在（紫微只化权/化科），模型若输出即为臆造。");
