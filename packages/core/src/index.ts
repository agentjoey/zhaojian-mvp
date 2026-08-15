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

export {
  computeFengshui, FENGSHUI_ENGINE_VERSION,
  deriveMingGua, ganzhiOfYear, directionsFor, elementDirections, adviseObject,
  buildPersonalRemedies, buildDwellingRemedies, sortRemedies,
  dwellingGua, matchWithPerson,
  DIRECTIONS, DIRECTION_LABEL, OPPOSITE, GUAS, GUA_DIRECTION, DIRECTION_GUA,
  EIGHT_MANSIONS, AUSPICIOUS_STARS, INAUSPICIOUS_STARS,
  ENV_PSYCH_ANCHORS, FENGSHUI_GUARDRAILS,
  OBJECT_CATEGORIES, CATEGORY_LABEL,
} from "./fengshui/index";
export type {
  FengshuiInput, FengshuiChart, DwellingView, DwellingInput, DwellingGua,
  MingGua, Gua, Direction, DirectionVerdict,
  /**
   * ⚠️ 必须保留别名，勿改回 `Star`。`./types/chart` 已经导出紫微星曜的 `Star`
   * （name/brightness/mutagen），经上面的 `export *` 进入同一 barrel；
   * 显式导出会静默遮蔽它 —— packages/core 自身编译与单测都不报错，
   * 只有全 monorepo `pnpm typecheck` 才会在 apps/web 的 ZiweiBoard.tsx 暴露。
   */
  Star as FengshuiStar,
  ElementAffinity, Remedy, Effort, EnvPsychAnchor,
  ObjectCategory, ObjectQuery, ObjectAdvice, ObjectAdviceInput,
} from "./fengshui/index";

export { normalizeBirth } from "./normalize";
export type { NormalizedBirth } from "./normalize";
export { computeDailyFortune } from "./daily/index";
export type { DailyFortune, Relation } from "./daily/index";

export { verifyInitData } from "./tg/initData";
export type { TgUser, VerifyResult } from "./tg/initData";
export { verifyTelegramLogin } from "./tg/loginWidget";
export type { TgLoginParams } from "./tg/loginWidget";
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
