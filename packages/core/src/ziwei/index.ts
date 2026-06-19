import { astro } from "iztro";
import type { BirthInput } from "../types/birth-input";
import type { ZiweiChart, Palace, Star } from "../types/chart";
import type { NormalizedBirth } from "../normalize";
import { normalizeBirth } from "../normalize";

/** iztro v2.5.8 安星法：'default'=通行版，'zhongzhou'=中州派。 */
type ZiweiAlgorithm = "default" | "zhongzhou";

/** iztro 星 → 统一 Star。mutagen 为空串时省略。 */
function mapStar(s: { name: string; brightness?: string; mutagen?: string }): Star {
  const star: Star = { name: s.name };
  if (s.brightness) star.brightness = s.brightness;
  if (s.mutagen === "禄" || s.mutagen === "权" || s.mutagen === "科" || s.mutagen === "忌") {
    star.mutagen = s.mutagen;
  }
  return star;
}

/**
 * 紫微斗数排盘 —— 包装 iztro (SylarLong)。见 research/ziwei-doushu-knowledge.md。
 * 四化流派可配置（默认中州派）；输入须为已归一的真太阳时。
 */
export function computeZiweiChart(
  input: BirthInput,
  pre?: NormalizedBirth,
  algorithm: ZiweiAlgorithm = "zhongzhou",
): ZiweiChart {
  const n = pre ?? normalizeBirth(input);
  astro.config({ algorithm });

  const solarDate = `${n.year}-${n.month}-${n.day}`;
  const a = astro.bySolar(solarDate, n.timeIndex, input.gender, true, "zh-CN");

  const palaces: Palace[] = a.palaces.map((p) => ({
    name: p.name,
    branch: p.earthlyBranch,
    isBodyPalace: p.isBodyPalace,
    majorStars: p.majorStars.map(mapStar),
    minorStars: p.minorStars.map(mapStar),
    adjectiveStars: p.adjectiveStars.map(mapStar),
  }));

  // 生年四化：扫描所有星，按 mutagen 归集所落星名
  const birthMutagens = { 禄: "", 权: "", 科: "", 忌: "" };
  for (const p of palaces) {
    for (const s of [...p.majorStars, ...p.minorStars, ...p.adjectiveStars]) {
      if (s.mutagen) birthMutagens[s.mutagen] = s.name;
    }
  }

  return {
    school: algorithm,
    soulPalaceBranch: a.earthlyBranchOfSoulPalace,
    bodyPalaceBranch: a.earthlyBranchOfBodyPalace,
    fiveElementBureau: a.fiveElementsClass,
    palaces,
    birthMutagens,
  };
}
