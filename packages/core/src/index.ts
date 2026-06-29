// @eamvp/core — 排盘核心 barrel
export * from "./types/birth-input";
export * from "./types/chart";
export { computeBaziChart } from "./bazi/index";
export { computeZiweiChart } from "./ziwei/index";
export { computeWesternChart } from "./western/index";
export { deriveStrength } from "./bazi/strength";
export type { StrengthEvidence } from "./bazi/strength";
export { deriveUsefulElements } from "./bazi/useful-elements";
export type { UsefulElements } from "./bazi/useful-elements";
export { deriveTriad } from "./ziwei/triad";
export type { Triad } from "./ziwei/triad";
export { computeZiweiHoroscope } from "./ziwei/horoscope";
export type { ZiweiHoroscope, HoroscopePeriod } from "./ziwei/horoscope";
export { deriveWesternProfile, MOON_PHASES } from "./western/profile";
export type { WesternProfile } from "./western/profile";
export { RESONANCE_ANCHORS, SYNTHESIS_GUARDRAILS } from "./synthesis/east-west-map";
export type { ResonanceAnchor } from "./synthesis/east-west-map";
export { deriveSpirit } from "./spirit/index";
export type { SpiritPersona, SpiritElement } from "./spirit/index";
export { PROFILE_QUESTIONNAIRE, formatQuestionnaire } from "./spirit/questionnaire";
export type { QuestionnaireItem, QuestionnaireAnswers } from "./spirit/questionnaire";
export { deriveSelfPortrait } from "./spirit/portrait";
export type { SelfPortrait, SelfPortraitDimension } from "./spirit/portrait";

export { normalizeBirth } from "./normalize";
export type { NormalizedBirth } from "./normalize";
export { computeDailyFortune } from "./daily/index";
export type { DailyFortune, Relation } from "./daily/index";

export { verifyInitData } from "./tg/initData";
export type { TgUser, VerifyResult } from "./tg/initData";
export { signSession, verifySession } from "./tg/session";

import { BirthInputSchema, type BirthInput } from "./types/birth-input";
import { UnifiedChartSchema, type UnifiedChart } from "./types/chart";
import { normalizeBirth } from "./normalize";
import { computeBaziChart } from "./bazi/index";
import { computeZiweiChart } from "./ziwei/index";
import { computeWesternChart } from "./western/index";

/**
 * 统一排盘入口。流程：校验 → normalize(真太阳时/子时) → 三引擎(共用归一时刻) → 组装 → Zod 校验。
 * 纯函数，便于按 BirthInput 缓存（见 technical-research §4）。
 */
export function computeUnifiedChart(input: BirthInput): UnifiedChart {
  const parsed = BirthInputSchema.parse(input);
  const n = normalizeBirth(parsed);
  const chart: UnifiedChart = {
    normalizedSolarTime: n.normalizedSolarTime,
    bazi: computeBaziChart(parsed, n),
    ziwei: computeZiweiChart(parsed, n),
    western: computeWesternChart(parsed, n),
  };
  return UnifiedChartSchema.parse(chart);
}
