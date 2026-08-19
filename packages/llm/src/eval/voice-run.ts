/**
 * 风格回归探针（EP-spirit-voice · C）—— 需 LLM_API_KEY。
 *
 * 5 个原型（从 EVAL_CASES 按主导五行各取一例，覆盖金木水火土）× 6 个标准问题，
 * 多轮实跑 streamSpiritChat，每条灵回应过 checkVoice，输出违规报告。用法：
 *   LLM_API_KEY=sk-... pnpm --filter @eamvp/llm probe:voice
 */
import { computeUnifiedChart, BirthInputSchema, deriveSpirit, type SpiritElement } from "@eamvp/core";
import { streamSpiritChat } from "../spirit";
import { resolveLlmConfig, isLlmConfigured } from "../provider";
import { EVAL_CASES } from "./cases";
import { checkVoice, type VoiceViolation } from "./voice";

/** 探针固定中文（线上冗长/AI 味抱怨集中在中文路径）。 */
const LANGUAGE = "zh" as const;

const STANDARD_QUESTIONS = [
  "我最近很焦虑",
  "我该换工作吗",
  "ta 适合我吗",
  "我为什么总是拖延",
  "今年要注意什么",
  "随便聊聊",
];

/** 与 prompt 硬规则一致：这些话术算「明确要求展开」，句数上限放宽到 6。 */
const EXPAND_TRIGGER = /详细|为什么|展开|多说点|tell me more|\bwhy\b|explain/i;

type ProbeResult = {
  element: SpiritElement;
  caseId: string;
  question: string;
  reply: string;
  violations: VoiceViolation[];
  error?: string;
};

/** 按主导五行从评测语料各挑一例，凑齐五原型。 */
function pickOneCasePerElement(): { element: SpiritElement; id: string; input: (typeof EVAL_CASES)[number]["input"] }[] {
  const picked = new Map<SpiritElement, (typeof EVAL_CASES)[number]>();
  for (const c of EVAL_CASES) {
    const chart = computeUnifiedChart(BirthInputSchema.parse(c.input));
    const el = deriveSpirit(chart).dominantElement;
    if (!picked.has(el)) picked.set(el, c);
  }
  return [...picked.entries()].map(([element, c]) => ({ element, id: c.id, input: c.input }));
}

export async function runVoiceProbe(opts?: {
  onReply?: (r: ProbeResult, index: number, total: number) => void;
}): Promise<ProbeResult[]> {
  const cfg = resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：设置 LLM_API_KEY 后再跑 probe:voice。");

  const cases = pickOneCasePerElement();
  const total = cases.length * STANDARD_QUESTIONS.length;
  const results: ProbeResult[] = [];
  let i = 0;

  for (const c of cases) {
    const chart = computeUnifiedChart(BirthInputSchema.parse(c.input));
    const persona = deriveSpirit(chart);
    const previousReplies: string[] = [];

    for (const question of STANDARD_QUESTIONS) {
      let result: ProbeResult;
      try {
        let reply = "";
        // 每题独立开场：history 只含本题（问题必须真的发给模型——第三轮教训：
        // 传 [] 时模型只对着种子寒暄语续写开场白，测的不是「回答」）。
        // 锚点复引检查不受影响——previousReplies 仍逐题累积喂给 checkVoice。
        for await (const chunk of streamSpiritChat(chart, [{ role: "user", content: question }], { language: LANGUAGE })) reply += chunk;
        const violations = checkVoice(reply, {
          language: LANGUAGE,
          allowLong: EXPAND_TRIGGER.test(question),
          previousSpiritReplies: previousReplies,
          anchorFacts: persona.anchorFacts,
        });
        result = { element: c.element, caseId: c.id, question, reply, violations };
        previousReplies.push(reply);
      } catch (e) {
        result = {
          element: c.element, caseId: c.id, question, reply: "",
          violations: [{ rule: "error", detail: e instanceof Error ? e.message : String(e) }],
          error: e instanceof Error ? e.message : String(e),
        };
      }
      results.push(result);
      opts?.onReply?.(result, i, total);
      i++;
    }
  }
  return results;
}
