/**
 * 解梦风格探针 CLI（需 LLM_API_KEY）。增量打印（中断也有数据）。用法：
 *   LLM_API_KEY=sk-... pnpm --filter @eamvp/llm probe:dream
 */
import { runDreamProbe } from "../src/eval/dream-run";

console.log("解梦风格探针（2 原型 × 8 梦例，dreamMode 检查）:");
const results = await runDreamProbe({
  onReply: (r, i, total) => {
    const flags = r.violations.map((v) => `${v.rule}(${v.detail})`).join(" ");
    console.log(`[${i + 1}/${total}] ${r.violations.length ? "✗" : "✓"} ${r.caseId} ·「${r.dream}」  ${flags}`);
  },
});

const bad = results.filter((r) => r.violations.length);
const strippedTotal = results.reduce((n, r) => n + r.predictionStripped, 0);
console.log(`\n样本 ${results.length}  通过 ${results.length - bad.length}/${results.length}  predictionStripped 总和 ${strippedTotal}（应恒 0，非 0 说明后置链漏了）`);
for (const r of bad) {
  console.log(`\n—— ${r.caseId} ·「${r.dream}」`);
  for (const v of r.violations) console.log(`   ✗ ${v.rule}: ${v.detail}`);
  if (r.reply) console.log(`   原文: ${r.reply.replace(/\n/g, " ").slice(0, 160)}`);
}

// 人工读样：全量原文（验收要求逐条读 16 条全文）——落盘 + 控制台
import { writeFileSync } from "node:fs";
const md = results
  .map((r, i) => `## ${i + 1}. ${r.caseId} ·「${r.dream}」\n\n${r.reply || `（无回复：${r.error ?? "未知错误"}）`}`)
  .join("\n\n");
writeFileSync("/tmp/probe-dream-full.md", `# 解梦探针全量原文（${results.length} 条）\n\n${md}\n`);
console.log("\n全量原文已写入 /tmp/probe-dream-full.md");
