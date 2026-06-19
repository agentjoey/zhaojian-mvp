"use server";

import { computeUnifiedChart, type BirthInput } from "@eamvp/core";

export type ChartHighlights = {
  normalizedSolarTime: string;
  dayMaster: string;
  dayMasterElement: string;
  yearPillar: string;
  soulPalaceBranch: string;
  soulPalaceStars: string[];
  birthMutagenJi: string; // 生年化忌（最具解读价值）
  sunSign: string | null;
  moonSign: string | null;
  ascendantSign: string | null;
  hardAspectCount: number | null;
};

export type ReadingResult =
  | { ok: true; highlights: ChartHighlights }
  | { ok: false; stage: "validation" | "engine"; message: string };

/**
 * 解读 Server Action —— 端到端排盘已落地（EP-002/002b/003）。
 * 当前：校验 → @eamvp/core 三引擎排盘 → 抽取关键事实。
 * 后续(EP-004/005)：事实 JSON → Claude 双声部解读（流式）→ 三段结果页。
 */
export async function createReading(formData: FormData): Promise<ReadingResult> {
  const raw: Partial<BirthInput> = {
    date: String(formData.get("date") ?? ""),
    time: formData.get("time") ? String(formData.get("time")) : null,
    gender: String(formData.get("gender") ?? "") as BirthInput["gender"],
    isLunar: formData.get("isLunar") === "on",
    longitude: formData.get("longitude") ? Number(formData.get("longitude")) : undefined,
    latitude: formData.get("latitude") ? Number(formData.get("latitude")) : undefined,
    nickname: formData.get("nickname") ? String(formData.get("nickname")) : undefined,
  };

  let chart;
  try {
    chart = computeUnifiedChart(raw as BirthInput);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Zod 校验错误 vs 引擎错误
    const stage = message.includes("date") || message.includes("gender") || message.includes("Invalid")
      ? "validation"
      : "engine";
    return { ok: false, stage, message };
  }

  const soul = chart.ziwei.palaces.find((p) => p.branch === chart.ziwei.soulPalaceBranch);

  return {
    ok: true,
    highlights: {
      normalizedSolarTime: chart.normalizedSolarTime,
      dayMaster: chart.bazi.dayMaster,
      dayMasterElement: chart.bazi.dayMasterElement,
      yearPillar: chart.bazi.pillars.year.stem + chart.bazi.pillars.year.branch,
      soulPalaceBranch: chart.ziwei.soulPalaceBranch,
      soulPalaceStars: (soul?.majorStars ?? []).map((s) => s.name + (s.brightness ? `·${s.brightness}` : "")),
      birthMutagenJi: chart.ziwei.birthMutagens.忌,
      sunSign: chart.western?.planets.find((p) => p.name.toLowerCase() === "sun")?.sign ?? null,
      moonSign: chart.western?.planets.find((p) => p.name.toLowerCase() === "moon")?.sign ?? null,
      ascendantSign: chart.western?.ascendant.sign ?? null,
      hardAspectCount: chart.western ? chart.western.aspects.filter((a) => a.quality === "hard").length : null,
    },
  };
}
