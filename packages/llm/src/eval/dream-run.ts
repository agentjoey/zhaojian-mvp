/**
 * 解梦风格探针（EP-dream-04）——需 LLM_API_KEY。
 * 2 个原型 × 8 个经典梦例，每条解读过 checkVoice（dreamMode）+ 预言措辞检查。
 *   LLM_API_KEY=sk-... pnpm --filter @eamvp/llm probe:dream
 */
import { computeUnifiedChart, BirthInputSchema } from "@eamvp/core";
import { generateDreamReply } from "../dream";
import { resolveLlmConfig, isLlmConfigured } from "../provider";
import { EVAL_CASES } from "./cases";
import { checkVoice, type VoiceViolation } from "./voice";

const DREAM_CASES = [
  "我梦见自己从很高的地方坠落，一直落不到底",
  "我梦见被什么东西追，我跑不动，喊不出声",
  "我梦见牙齿一颗颗掉下来",
  "我梦见自己在一片很清的水面上走",
  "我梦见去世的奶奶，她一句话也不说，就看着我",
  "我梦见考试，卷子上的字一个都不认识",
  "我梦见在陌生的城市里迷路，手机没有信号",
  "我梦见自己在飞，飞得很低，贴着屋顶",
];

export type DreamProbeResult = {
  caseId: string;
  dream: string;
  reply: string;
  violations: VoiceViolation[];
  predictionStripped: number;
  error?: string;
};

export async function runDreamProbe(opts?: {
  onReply?: (r: DreamProbeResult, index: number, total: number) => void;
}): Promise<DreamProbeResult[]> {
  const cfg = resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：设置 LLM_API_KEY 后再跑 probe:dream。");
  // 两个原型足够覆盖口吻差异（金=shanghai-m-1991、水=guangzhou-m-1995，与 voice 探针同源）
  const cases = [EVAL_CASES[0]!, EVAL_CASES[2]!];
  const total = cases.length * DREAM_CASES.length;
  const results: DreamProbeResult[] = [];
  let i = 0;
  for (const c of cases) {
    const chart = computeUnifiedChart(BirthInputSchema.parse(c.input));
    for (const dream of DREAM_CASES) {
      let result: DreamProbeResult;
      try {
        const { text: reply, stripped } = await generateDreamReply(chart, dream, { language: "zh" });
        const violations = checkVoice(reply, { language: "zh", dreamMode: true });
        const predictionStripped = stripped.length; // 真实管线里 sanitizeDream 的剥离数（非对成品重扫）
        result = { caseId: c.id, dream, reply, violations, predictionStripped };
      } catch (e) {
        result = { caseId: c.id, dream, reply: "", violations: [{ rule: "error", detail: String(e) }], predictionStripped: 0, error: String(e) };
      }
      results.push(result);
      opts?.onReply?.(result, i, total);
      i++;
    }
  }
  return results;
}
