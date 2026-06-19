import { computeUnifiedChart, BirthInputSchema } from "@eamvp/core";
import { extractFacts } from "../facts";
import { generateReading } from "../reading";
import { resolveLlmConfig, isLlmConfigured } from "../provider";
import { scoreReading, type Verdict } from "./score";
import { EVAL_CASES } from "./cases";

export type CaseResult = { id: string; verdict: Verdict; chars: number; error?: string };
export type EvalReport = {
  model: string;
  n: number;
  passed: number;
  avgOverall: number;
  avgGrounding: number;
  avgGuardrails: number;
  avgFormat: number;
  hallucinationCases: string[];
  guardrailCases: string[];
  formatBreakCases: string[];
  results: CaseResult[];
};

/** 实跑：对每个 case 排盘→真模型解读→评分。需 LLM_API_KEY。语言默认中文。
 *  onCase 在每例完成时回调，便于增量打印（中断也有数据）。*/
export async function runEval(opts?: {
  language?: "zh" | "en";
  limit?: number;
  retries?: number;
  onCase?: (r: CaseResult, index: number, total: number) => void;
}): Promise<EvalReport> {
  const cfg = resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：设置 LLM_API_KEY 后再跑 eval。");
  const cases = EVAL_CASES.slice(0, opts?.limit ?? EVAL_CASES.length);
  const results: CaseResult[] = [];
  const maxAttempts = (opts?.retries ?? 2) + 1;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    let result: CaseResult;
    try {
      const chart = computeUnifiedChart(BirthInputSchema.parse(c.input));
      const facts = extractFacts(chart);
      // 瞬时 fetch 失败重试（避免网络/限流污染评分）
      let markdown = "";
      let lastErr: unknown;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          markdown = (await generateReading(chart, { language: opts?.language ?? "zh" })).markdown;
          lastErr = undefined;
          break;
        } catch (err) {
          lastErr = err;
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      if (lastErr) throw lastErr;
      result = { id: c.id, verdict: scoreReading(markdown, facts), chars: markdown.length };
    } catch (e) {
      result = {
        id: c.id,
        chars: 0,
        error: e instanceof Error ? e.message : String(e),
        verdict: { grounding: { score: 0, hallucinatedStars: [], westernLeak: [], mutagenErrors: [] }, guardrails: { score: 0, violations: [], hasDisclaimer: false }, format: { score: 0, sectionsFound: 0, missing: [] }, overall: 0, pass: false },
      };
    }
    results.push(result);
    opts?.onCase?.(result, i, cases.length);
  }

  const ok = results.filter((r) => !r.error);
  const avg = (f: (v: Verdict) => number) => (ok.length ? ok.reduce((s, r) => s + f(r.verdict), 0) / ok.length : 0);

  return {
    model: cfg.model,
    n: results.length,
    passed: results.filter((r) => r.verdict.pass).length,
    avgOverall: round(avg((v) => v.overall)),
    avgGrounding: round(avg((v) => v.grounding.score)),
    avgGuardrails: round(avg((v) => v.guardrails.score)),
    avgFormat: round(avg((v) => v.format.score)),
    hallucinationCases: results.filter((r) => r.verdict.grounding.hallucinatedStars.length || r.verdict.grounding.westernLeak.length).map((r) => r.id),
    guardrailCases: results.filter((r) => r.verdict.guardrails.violations.length).map((r) => r.id),
    formatBreakCases: results.filter((r) => r.verdict.format.missing.length).map((r) => r.id),
    results,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
