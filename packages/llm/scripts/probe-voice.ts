/**
 * 风格回归探针 CLI（需 LLM_API_KEY）。增量打印（中断也有数据）。用法：
 *   LLM_API_KEY=sk-... pnpm --filter @eamvp/llm probe:voice
 */
import { runVoiceProbe } from "../src/eval/voice-run";

console.log("风格探针（5 原型 × 6 标准问题，实时）:");
const results = await runVoiceProbe({
  onReply: (r, i, total) => {
    const flags = r.violations.map((v) => `${v.rule}(${v.detail})`).join(" ");
    console.log(`[${i + 1}/${total}] ${r.violations.length ? "✗" : "✓"} ${r.element}/${r.question}  ${flags}`);
  },
});

const bad = results.filter((r) => r.violations.length);
console.log(`\n样本 ${results.length}  通过 ${results.length - bad.length}/${results.length}`);
for (const r of bad) {
  console.log(`\n—— ${r.element} (${r.caseId}) ·「${r.question}」`);
  for (const v of r.violations) console.log(`   ✗ ${v.rule}: ${v.detail}`);
  if (r.reply) console.log(`   原文: ${r.reply.replace(/\n/g, " ").slice(0, 160)}`);
}
