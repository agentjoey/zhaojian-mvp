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
  const inter = f.interactions.length ? `\n流日×命局：${f.interactions.map((i) => i.note).join("；")}` : "";
  const fav = f.favorableToday ? "（今日五行为命主喜用，整体偏顺）" : "";
  const user =
    `称呼：${opts?.nickname ?? "你"}\n` +
    `日期：${f.date}（农历${f.lunarDate}）\n` +
    `流日：${f.dayGanZhi}（${f.dayElement}），对命主（${f.masterElement}）为「${f.relation}」${fav}\n` +
    `总评：${f.tone}${inter}\n` +
    `宜：${f.auspicious.slice(0, 3).join("、")}\n` +
    `忌：${f.caution.slice(0, 3).join("、")}`;

  const raw = await chat(cfg, [
    { role: "system", content: sys },
    { role: "user", content: user },
  ], { maxTokens: 160, temperature: 0.85 });

  return raw.trim().split("\n")[0]!.replace(/^[「『"']+|[」』"'。]+$/g, "").slice(0, 50);
}

/**
 * 当日「心理行为宜忌」（EP-cal-img/竞品参考）：在黄历宜忌之外，给出 3 宜 3 忌的
 * **现代、具体、可执行、成长向**行为建议，贴合当日命理能量。短句、低成本，调用方缓存。
 */
export async function dailyBehaviorAdvice(
  f: DailyFortune,
  opts?: { nickname?: string; config?: LlmConfig },
): Promise<{ do: string[]; dont: string[] }> {
  const cfg = opts?.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置");

  const sys =
    "你是「照见」的每日生活提点写作者。依据当日命理能量，写**今日宜 3 条 + 今日忌 3 条**：" +
    "现代、具体、可立刻执行、贴近生活与心理成长（如「给久未联系的人发条消息」「把今天最重要的一件事先做完」「在疲惫时别做重大决定」）。" +
    "每条不超过 14 字，口语自然，与当日能量呼应。" +
    "禁忌：不用黄历术语（祭祀/嫁娶/动土/破屋等）、不预言吉凶、不谈医疗/财务/投资具体标的、不用「一定/必然/注定」。" +
    "严格只输出两行，格式：\n宜｜第一条｜第二条｜第三条\n忌｜第一条｜第二条｜第三条";
  const inter = f.interactions.length ? `\n流日×命局：${f.interactions.map((i) => i.note).join("；")}` : "";
  const user =
    `日期：${f.date}\n` +
    `今日能量：${f.dayGanZhi}（对你为「${f.relation}」${f.favorableToday ? "，属命主喜用、偏顺" : ""}）\n` +
    `基调：${f.tone}${inter}`;

  const raw = await chat(cfg, [
    { role: "system", content: sys },
    { role: "user", content: user },
  ], { maxTokens: 260, temperature: 0.8 });

  const pick = (label: string): string[] => {
    const line = raw.split("\n").find((l) => l.trim().startsWith(label));
    if (!line) return [];
    return line
      .split(/[｜|]/)
      .slice(1)
      .map((s) => s.trim().replace(/^[、，。\s]+|[、，。\s]+$/g, ""))
      .filter(Boolean)
      .slice(0, 3);
  };
  return { do: pick("宜"), dont: pick("忌") };
}
