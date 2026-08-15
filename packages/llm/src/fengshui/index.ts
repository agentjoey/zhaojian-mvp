import type { FengshuiChart, ObjectAdvice } from "@eamvp/core";
import { resolveLlmConfig, isLlmConfigured, type LlmConfig } from "../provider";
import { chat } from "../client";
import type { ReadingLanguage } from "../prompt";
import { extractFengshuiFacts } from "./facts";
import {
  buildFengshuiSystemPrompt, buildFengshuiUserPrompt, parseFengshuiSections,
  buildObjectAdviceSystemPrompt, buildObjectAdviceUserPrompt,
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
 * 抛错的两种情形：① LLM 未配置；② 模型输出三节全部解析为空（没有任何一个合法 H2
 * 标题被 parseFengshuiSections 识别出来，见最终评审 Blocking 1）——后者不当作
 * degraded 处理，因为 degraded 的前提是「拿到了三节文本」，这里根本没拿到。
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
  const sections = parseFengshuiSections(text, language);
  // 最终评审 Blocking 1：parseFengshuiSections 对缺节容错、缺节置空——这在「模型漏了
  // 一节」时是合理行为，但当三节全部解析为空（例如模型把 H2 写成 H3、或把标题加粗），
  // 说明没有任何一节被成功切出：这不是「拿到了但要素不全」，是「压根没拿到可用叙述」。
  // 若不拦截，调用方（/api/fengshui/reading）会把这当成一次成功生成返回 200 +
  // degraded=false，页面据此渲染三个空标题、并把这份空报告永久写入 localStorage 缓存——
  // 用户会卡在空报告里，直到引擎版本号或 locale 变化才会重新请求（见最终评审 Blocking 1）。
  // 这里选择抛错，与「LLM 未配置」走同一条路径：调用方按 failed 处理、给出重试入口、
  // 不写缓存。语义上这确实是「没拿到可用叙述」而非「拿到了但不可信」（那是 degraded
  // 的语义——模型说错了至少一个确定性事实，仍拿到了三节文本）。
  const allSectionsBlank = FENGSHUI_SECTION_KEYS.every((k) => sections[k] === "");
  if (allSectionsBlank) {
    throw new Error("风水叙述解析失败：模型输出未包含任何可识别的分节标题");
  }
  return {
    markdown: text,
    sections,
    corrections,
    degraded: corrections.length > 0,
  };
}

/**
 * 物件顾问的说人话层（EP-fs-04）。短输出、低成本，调用方可缓存。
 * prompt 构建委托给 `buildObjectAdviceSystemPrompt`/`buildObjectAdviceUserPrompt`
 * （见 prompt.ts），本函数只做编排：解析配置 → 建两条消息 → 调 LLM → trim。
 *
 * ⚠️ 反幻觉只有 prompt 硬规则这**一道**，不是 `generateFengshuiReading` 那样的
 * facts → prompt → sanitize → 方位对拍四道链路。这不是遗漏，是这里另外两道机械净化
 * 天然对不上号，原样接上只会空转、不提供实际保护：
 * - `sanitizeFengshui` 只读 `FengshuiFacts.remedies`（找 evidence 为「传统象征」的
 *   条目做伪科学措辞清除）；`ObjectAdvice` 没有 `remedies` 字段——物件建议的落位
 *   结论本来就不含「传统象征」化解内容，接上这道等于对着不存在的输入空转。
 * - `verifyDirectionConsistency` 需要一份 `FengshuiFacts`（八方查表结果）作为比对
 *   基准；`ObjectAdvice` 的形状（recommendedDirections/avoid/intendedVerdict）
 *   构造不出 `FengshuiFacts`，没有可供对拍的基准。
 * 因此这里的可信度完全依赖 prompt 硬规则本身（含 core `FENGSHUI_GUARDRAILS` +
 * 物件专属约束）说到做到——后人扩展本函数时，不要想当然地以为四道防线都在。
 */
export async function adviseObjectText(
  advice: ObjectAdvice,
  opts?: { config?: LlmConfig; language?: ReadingLanguage; nickname?: string },
): Promise<string> {
  const cfg = opts?.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置");
  const language = opts?.language ?? "zh";

  const raw = await chat(cfg, [
    { role: "system", content: buildObjectAdviceSystemPrompt(language) },
    { role: "user", content: buildObjectAdviceUserPrompt(advice, { nickname: opts?.nickname }) },
  ], { maxTokens: 320, temperature: 0.8 });
  return raw.trim();
}
