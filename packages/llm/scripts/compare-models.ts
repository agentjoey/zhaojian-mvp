/**
 * 三模型对比：minimax-m3 / minimax-m2.7-highspeed / deepseek-v4-flash。
 * 指标：响应速度(首字 ms)、完成速度(总 ms)、稳定性(成功率)、命理语言(存样本供人判)、幻觉度(接地/四化错配)。
 * 用法：MINIMAX_KEY=sk-cp.. DEEPSEEK_KEY=sk.. pnpm --filter @eamvp/llm exec tsx scripts/compare-models.ts
 */
import { writeFileSync } from "node:fs";
import { computeUnifiedChart, BirthInputSchema } from "@eamvp/core";
import { buildMessages, chatStream, extractFacts, scoreReading, sanitizeReading, EVAL_CASES } from "../src/index";
import type { LlmConfig } from "../src/index";

const MM = process.env.MINIMAX_KEY ?? "";
const DS = process.env.DEEPSEEK_KEY ?? "";

const MODELS: { label: string; cfg: LlmConfig }[] = [
  { label: "minimax-m3", cfg: { provider: "minimax", wire: "anthropic", baseUrl: "https://api.minimax.io/anthropic", model: "MiniMax-M3", apiKey: MM, supportsJsonSchema: false } },
  { label: "m2.7-highspeed", cfg: { provider: "minimax", wire: "anthropic", baseUrl: "https://api.minimax.io/anthropic", model: "minimax-m2.7-highspeed", apiKey: MM, supportsJsonSchema: false } },
  { label: "deepseek-v4-flash", cfg: { provider: "deepseek", wire: "openai", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash", apiKey: DS, supportsJsonSchema: true } },
];

// 代表性子集：5 例西方在场（正常流式）+ 1 例无时辰（降级/越界测试）
const SUBSET = ["shanghai-m-1991", "beijing-f-1988", "guangzhou-m-1995", "newyork-m-1975", "lunar-m-1986", "no-time-m-1990"];
const cases = EVAL_CASES.filter((c) => SUBSET.includes(c.id));

type Rec = { id: string; ok: boolean; firstByte: number; total: number; grounding: number; pass: boolean; mutagen: string[]; leak: number; hallu: string[]; chars: number; err?: string };

async function runOne(cfg: LlmConfig, caseInput: unknown): Promise<{ md: string; firstByte: number; total: number }> {
  const chart = computeUnifiedChart(BirthInputSchema.parse(caseInput));
  const msgs = buildMessages(chart, { language: "zh" });
  const t0 = Date.now();
  let firstByte = 0;
  let full = "";
  for await (const chunk of chatStream(cfg, msgs, { maxTokens: 8000 })) {
    if (!firstByte) firstByte = Date.now() - t0;
    full += chunk;
  }
  const md = sanitizeReading(full, "zh", chart.western !== null);
  return { md, firstByte, total: Date.now() - t0 };
}

const results: Record<string, Rec[]> = {};
for (const { label, cfg } of MODELS) {
  if (!cfg.apiKey) {
    console.log(`跳过 ${label}（无 key）`);
    continue;
  }
  results[label] = [];
  console.log(`\n=== ${label} (${cfg.model}) ===`);
  for (const c of cases) {
    const chart = computeUnifiedChart(BirthInputSchema.parse(c.input));
    const facts = extractFacts(chart);
    let rec: Rec;
    try {
      let out: { md: string; firstByte: number; total: number } | null = null;
      let lastErr: unknown;
      for (let a = 0; a < 2; a++) {
        try { out = await runOne(cfg, c.input); lastErr = undefined; break; }
        catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 1500)); }
      }
      if (!out) throw lastErr;
      const v = scoreReading(out.md, facts);
      rec = { id: c.id, ok: true, firstByte: out.firstByte, total: out.total, grounding: v.grounding.score, pass: v.pass, mutagen: v.grounding.mutagenErrors, leak: v.grounding.westernLeak.length, hallu: v.grounding.hallucinatedStars, chars: out.md.length };
      // 存第一例样本供语言判读
      if (results[label].filter((r) => r.ok).length === 0) writeFileSync(`/tmp/sample-${label}.md`, out.md);
    } catch (e) {
      rec = { id: c.id, ok: false, firstByte: 0, total: 0, grounding: 0, pass: false, mutagen: [], leak: 0, hallu: [], chars: 0, err: e instanceof Error ? e.message.slice(0, 50) : String(e) };
    }
    results[label].push(rec);
    const flags = [rec.mutagen.length ? `四化[${rec.mutagen.join()}]` : "", rec.leak ? `越界[${rec.leak}]` : "", rec.hallu.length ? `幻觉[${rec.hallu.join()}]` : "", rec.err ? `ERR(${rec.err})` : ""].filter(Boolean).join(" ");
    console.log(`  ${rec.ok ? (rec.pass ? "✓" : "✗") : "✗"} ${rec.id.padEnd(18)} 首字 ${String(rec.firstByte).padStart(5)}ms 总 ${String(rec.total).padStart(6)}ms ${rec.chars}字 ${flags}`);
  }
}

console.log("\n\n========== 汇总对比 ==========");
console.log("模型".padEnd(18), "成功率", "首字ms", "完成ms", "接地", "通过", "四化错配", "越界");
for (const { label } of MODELS) {
  const rs = results[label];
  if (!rs) continue;
  const ok = rs.filter((r) => r.ok);
  const avg = (f: (r: Rec) => number) => (ok.length ? Math.round(ok.reduce((s, r) => s + f(r), 0) / ok.length) : 0);
  const mutN = rs.filter((r) => r.mutagen.length).length;
  const leakN = rs.filter((r) => r.leak).length;
  console.log(
    label.padEnd(18),
    `${ok.length}/${rs.length}`.padEnd(6),
    String(avg((r) => r.firstByte)).padStart(6),
    String(avg((r) => r.total)).padStart(6),
    (ok.length ? (ok.reduce((s, r) => s + r.grounding, 0) / ok.length).toFixed(2) : "—").padStart(5),
    `${rs.filter((r) => r.pass).length}/${rs.length}`.padEnd(5),
    String(mutN).padStart(6),
    String(leakN).padStart(4),
  );
}
console.log("\n样本解读已存 /tmp/sample-<model>.md（供命理语言准确性人工判读）");
