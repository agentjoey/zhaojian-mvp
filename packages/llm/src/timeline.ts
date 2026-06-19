import type { UnifiedChart, ZiweiHoroscope } from "@eamvp/core";
import { deriveUsefulElements, SYNTHESIS_GUARDRAILS } from "@eamvp/core";
import { resolveLlmConfig, isLlmConfigured, type LlmConfig } from "./provider";
import { chat } from "./client";

/**
 * 时序层（EP-521 接入）：把紫微大限/流年四化 + 八字大运合成「时序声部」，
 * 谈命主【当下这一年的内在发展主题与成长张力】——反思性、**非事件预测**。
 * 按 date 现算、按年缓存；不进冻结命盘。
 */
export type TimelineFacts = {
  date: string;
  decadal: { ganzhi: string; mutagens: Record<string, string> }; // 大限
  yearly: { ganzhi: string; mutagens: Record<string, string> }; // 流年
  luckPillar: string | null; // 八字大运
  dayMaster: string;
  dayMasterElement: string;
  favorableElements: string[];
};

export function extractTimelineFacts(chart: UnifiedChart, horoscope: ZiweiHoroscope): TimelineFacts {
  const useful = deriveUsefulElements(chart.bazi);
  return {
    date: horoscope.date,
    decadal: { ganzhi: horoscope.decadal.stem + horoscope.decadal.branch, mutagens: horoscope.decadal.mutagens },
    yearly: { ganzhi: horoscope.yearly.stem + horoscope.yearly.branch, mutagens: horoscope.yearly.mutagens },
    luckPillar: chart.bazi.currentLuckPillar ?? null,
    dayMaster: chart.bazi.dayMaster,
    dayMasterElement: chart.bazi.dayMasterElement,
    favorableElements: useful.favorable,
  };
}

const mutLine = (label: string, m: Record<string, string>) =>
  `${label}四化：化禄=${m.禄} 化权=${m.权} 化科=${m.科} 化忌=${m.忌}`;

export async function generateTimeline(
  chart: UnifiedChart,
  horoscope: ZiweiHoroscope,
  opts?: { nickname?: string; config?: LlmConfig },
): Promise<string> {
  const cfg = opts?.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置");
  const f = extractTimelineFacts(chart, horoscope);

  const sys =
    "你是「照见」的『时序声部』。依据紫微大限/流年四化与八字大运，谈命主【当下这一年（及所处大限）的内在发展主题与成长张力】。\n" +
    "要求：反思性、成长导向；**绝不做事件预测或吉凶断言、不涉医疗/财务/生死**。" +
    "重点解读**流年化忌**（今年最易卡顿、需要照见的功课）与**化禄**（顺势可借力之处），结合大限/大运的五行氛围，" +
    "并可据喜用五行给一句方向感。只用给定的四化星与干支，不臆造。\n" +
    "守护栏：" + SYNTHESIS_GUARDRAILS.join(" ") + "\n" +
    "输出：中文 markdown，一个 `## 本年时序` 标题 + 2–3 段，共约 220–320 字，结尾一句温和提醒（非预测）。";
  const user =
    `称呼：${opts?.nickname ?? "你"}\n` +
    `日期：${f.date}\n` +
    `所处大限：${f.decadal.ganzhi}限，${mutLine("大限", f.decadal.mutagens)}\n` +
    `流年：${f.yearly.ganzhi}年，${mutLine("流年", f.yearly.mutagens)}\n` +
    `八字大运：${f.luckPillar ?? "（未起运）"}；日主${f.dayMaster}（${f.dayMasterElement}）；喜用五行=${f.favorableElements.length ? f.favorableElements.join("、") : "中和"}`;

  const raw = await chat(cfg, [
    { role: "system", content: sys },
    { role: "user", content: user },
  ], { maxTokens: 900, temperature: 0.7 });
  return raw.trim();
}
