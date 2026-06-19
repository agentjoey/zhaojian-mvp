/**
 * 实跑接地性 eval（需 LLM_API_KEY）。增量打印（中断也有数据）。用法：
 *   LLM_API_KEY=sk-cp-... pnpm --filter @eamvp/llm exec tsx scripts/run-eval.ts [limit]
 */
import { runEval } from "../src/index";
import type { CaseResult } from "../src/index";

const limit = process.argv[2] ? Number(process.argv[2]) : undefined;

function line(c: CaseResult): string {
  const v = c.verdict;
  const flags = [
    v.grounding.hallucinatedStars.length ? `幻觉[${v.grounding.hallucinatedStars.join("/")}]` : "",
    v.grounding.mutagenErrors.length ? `四化错配[${v.grounding.mutagenErrors.join("/")}]` : "",
    v.grounding.westernLeak.length ? `越界[${v.grounding.westernLeak.length}]` : "",
    v.guardrails.violations.length ? `违规[${v.guardrails.violations.join("/")}]` : "",
    v.format.missing.length ? `缺段[${v.format.missing.join("/")}]` : "",
    c.error ? `ERR(${c.error.slice(0, 40)})` : "",
  ].filter(Boolean).join(" ");
  return `  ${v.pass ? "✓" : "✗"} ${c.id.padEnd(20)} 综合 ${v.overall}  ${flags}`;
}

console.log("逐例（实时）:");
const r = await runEval({
  language: "zh",
  limit,
  onCase: (c, i, total) => console.log(`[${i + 1}/${total}]${line(c)}`),
});

const errs = r.results.filter((c) => c.error).length;
console.log(`\n模型: ${r.model}  样本: ${r.n}  通过: ${r.passed}/${r.n}  (网络失败 ${errs})`);
console.log(`均分  综合 ${r.avgOverall}  接地 ${r.avgGrounding}  守护栏 ${r.avgGuardrails}  格式 ${r.avgFormat}`);
if (r.hallucinationCases.length) console.log(`⚠ 幻觉/越界: ${r.hallucinationCases.join(", ")}`);
if (r.guardrailCases.length) console.log(`⚠ 守护栏违规: ${r.guardrailCases.join(", ")}`);
// 四化错配单列（最关注）
const mut = r.results.filter((c) => c.verdict.grounding.mutagenErrors.length);
if (mut.length) console.log(`⚠ 四化错配: ${mut.map((c) => `${c.id}(${c.verdict.grounding.mutagenErrors.join("/")})`).join(", ")}`);
else console.log(`✓ 四化：本轮无错配`);
