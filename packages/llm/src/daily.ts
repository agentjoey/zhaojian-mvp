import type { DailyFortune } from "@eamvp/core";
import { resolveLlmConfig, isLlmConfigured, type LlmConfig } from "./provider";
import { chat } from "./client";

/**
 * 运势日历「轻润色」（EP-cal-llm）：在确定性流日评分之上，生成**一句**温和、
 * 反思性、非决定论的当日提点。短文、低成本；调用方按 (档案,日期) 缓存即可。
 */
export async function polishDailyFortune(
  f: DailyFortune,
  opts?: { nickname?: string; config?: LlmConfig },
): Promise<string> {
  const cfg = opts?.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置");

  const sys =
    "你是「照见」的每日观照写作者。依据当日命理流日，用【一句】不超过 38 字的中文，" +
    "给出温和、反思性、成长导向的当日提点。措辞如「今日宜…」「不妨…」「可留意…」，" +
    "贴合给定的关系/宜忌/总评。禁忌：不预言吉凶、不谈医疗/财务/生死、不用「一定/必然/注定/务必」。" +
    "只输出这一句本身，无引号、无前后缀、不换行。";
  const user =
    `称呼：${opts?.nickname ?? "你"}\n` +
    `日期：${f.date}（农历${f.lunarDate}）\n` +
    `流日：${f.dayGanZhi}（${f.dayElement}），对命主（${f.masterElement}）为「${f.relation}」\n` +
    `总评：${f.tone}\n` +
    `宜：${f.auspicious.slice(0, 3).join("、")}\n` +
    `忌：${f.caution.slice(0, 3).join("、")}`;

  const raw = await chat(cfg, [
    { role: "system", content: sys },
    { role: "user", content: user },
  ], { maxTokens: 160, temperature: 0.85 });

  return raw.trim().split("\n")[0]!.replace(/^[「『"']+|[」』"'。]+$/g, "").slice(0, 50);
}
