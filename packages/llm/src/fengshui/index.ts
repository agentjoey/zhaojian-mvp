import type { FengshuiChart, ObjectAdvice } from "@eamvp/core";
import { resolveLlmConfig, isLlmConfigured, type LlmConfig } from "../provider";
import { chat } from "../client";
import type { ReadingLanguage } from "../prompt";
import { extractFengshuiFacts, type FengshuiFacts } from "./facts";
import {
  buildFengshuiSystemPrompt, buildFengshuiUserPrompt, parseFengshuiSections,
  FENGSHUI_SECTION_KEYS, type FengshuiSectionKey,
} from "./prompt";
import { sanitizeFengshui, verifyDirectionConsistency, type DirectionCorrection } from "./guard";

export * from "./facts";
export * from "./prompt";
export * from "./guard";

export type FengshuiReadingOptions = {
  config?: LlmConfig;
  language?: ReadingLanguage;
  nickname?: string;
};

export type FengshuiReading = {
  markdown: string;
  sections: Record<FengshuiSectionKey, string>;
  /**
   * `verifyDirectionConsistency` 做出的每一次方位↔星名纠正。非空说明模型至少
   * 说错过一个查表可得的确定性事实（八方吉凶星名对不上真实命卦）。
   *
   * ⚠️ 纠正只改得回被点名的那个星名，改不回围绕这个（错误）方位展开的整段自由
   * 文本——模型给出"东为绝命方，宜……"时，若"东"其实是生气，纠正只会把"绝命"
   * 换成"生气"，但后面那句因误判而生的建议逻辑未必还成立。换言之 corrections
   * 非空是"模型对事实理解有误"的信号，不是"已完全修复"的保证。
   * 该字段主要供排障/审计追溯用；调用方**不应**据此自行决定是否降级——
   * 请改读 {@link FengshuiReading.degraded}（专为该决策设计，见其文档）。
   */
  corrections: DirectionCorrection[];
  /**
   * 一旦为 true，代表本次输出不应被当作可信的最终结果直接渲染：
   * 等价于 `corrections.length > 0`（模型在生成中至少说错一个确定性事实，已被
   * 机械纠正，但纠正救得回星名、救不回建立在错误前提上的周边论述——见
   * {@link FengshuiReading.corrections} 的文档）。
   *
   * 单独存这个布尔值，就是为了让调用方**不必读 corrections 数组本身**也能一眼
   * 判断可信度：拿到 `FengshuiReading` 后先查 `degraded`，为 true 时应当降级展示
   * （例如只出确定性盘图 + 化解清单、隐藏本节自由文本，或提示用户重试）或重新
   * 生成一次，而不是照常渲染。
   */
  degraded: boolean;
};

/**
 * 生成风水报告（EP-fs-05）。反幻觉链：facts → prompt 硬规则 → sanitize → 方位对拍。
 * 抛错即代表无法生成 —— 调用方应降级为纯确定性呈现（盘图 + 化解清单），而非空页。
 *
 * 即便不抛错，返回值里的 `degraded` 也可能为 true —— 那是另一档更隐蔽的失败：
 * 模型把方位说错了，机械纠正能救回星名，救不回整段建立在错误前提上的自由文本。
 * 调用方必须检查 `degraded`，不能假设"没抛错 = 可以直接渲染"。
 */
export async function generateFengshuiReading(
  f: FengshuiChart,
  opts?: FengshuiReadingOptions,
): Promise<FengshuiReading> {
  const cfg = opts?.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置");
  const language = opts?.language ?? "zh";
  const facts = extractFengshuiFacts(f);

  const raw = await chat(cfg, [
    { role: "system", content: buildFengshuiSystemPrompt(language) },
    { role: "user", content: buildFengshuiUserPrompt(facts, { nickname: opts?.nickname }) },
  ], { maxTokens: 1600, temperature: 0.7 });

  const cleaned = sanitizeFengshui(raw, facts);
  const { text, corrections } = verifyDirectionConsistency(cleaned, facts);
  return {
    markdown: text,
    sections: parseFengshuiSections(text, language),
    corrections,
    degraded: corrections.length > 0,
  };
}

/** 物件顾问的说人话层（EP-fs-04）。短输出、低成本，调用方可缓存。 */
export async function adviseObjectText(
  advice: ObjectAdvice,
  opts?: { config?: LlmConfig; language?: ReadingLanguage; nickname?: string },
): Promise<string> {
  const cfg = opts?.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置");

  const sys =
    "你是 Mira 的「境」声部。把给定的物件摆放结论写成 2–3 句自然中文，" +
    "口吻平实、可执行、非决定论。只准使用给定的方位与规则，不得新增方位或断言吉凶后果。" +
    "不用「一定/必然/注定」，不谈医疗财务。只输出这几句本身。";
  const user = [
    `物件：${advice.categoryLabel}`,
    `五行：${advice.elementOfObject ?? "未定"}`,
    `推荐方位：${advice.recommendedDirections.map((r) => `${r.label}（${r.reason}）`).join("；") || "无"}`,
    `不宜方位：${advice.avoid.map((r) => `${r.label}（${r.reason}）`).join("；") || "无"}`,
    `品类规则：${advice.categoryRules.join("；")}`,
    `与命主关系：${advice.personalFit}`,
    advice.intendedVerdict
      ? `用户想放在：${advice.intendedVerdict.direction}，该方为${advice.intendedVerdict.star}（${advice.intendedVerdict.auspicious ? "吉" : "凶"}）`
      : "",
  ].filter(Boolean).join("\n");

  const raw = await chat(cfg, [
    { role: "system", content: sys },
    { role: "user", content: user },
  ], { maxTokens: 320, temperature: 0.8 });
  return raw.trim();
}

export { FENGSHUI_SECTION_KEYS };
export type { FengshuiSectionKey, FengshuiFacts, DirectionCorrection };
