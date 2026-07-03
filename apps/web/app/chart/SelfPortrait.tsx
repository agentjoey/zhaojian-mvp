"use client";

import { deriveSelfPortrait, deriveSpirit } from "@eamvp/core";
import type { QuestionnaireAnswers } from "@eamvp/core";
import type { Profile } from "@/lib/profiles";
import { Card } from "@/components/ui";
import { useT } from "@/lib/i18n/I18nProvider";
import { SpiritSigil } from "./SpiritSigil";

const DIM_ELEMENT: Record<string, "wood" | "fire" | "earth" | "metal" | "water"> = {
  grounding: "earth",
  drive: "fire",
  reflection: "water",
  connection: "wood",
  openness: "metal",
};

const ELEMENT_COLORS: Record<string, string> = {
  wood: "var(--color-wood)",
  fire: "var(--color-fire)",
  earth: "var(--color-earth)",
  metal: "var(--color-metal)",
  water: "var(--color-water)",
};

export function PortraitDimensions({
  dimensions,
}: {
  dimensions: { key: string; label: string; value: number }[];
}) {
  return (
    <div className="space-y-4">
      {dimensions.map((dim) => (
        <div key={dim.key} className="grid grid-cols-[80px_1fr_28px] items-center gap-3 sm:grid-cols-[96px_1fr_28px]">
          <span className="text-[13px] text-ink-2">{dim.label}</span>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--color-line)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${dim.value * 10}%`, background: ELEMENT_COLORS[DIM_ELEMENT[dim.key] ?? "earth"] }}
            />
          </div>
          <span className="text-right text-[13px] tabular-nums text-muted">{dim.value}</span>
        </div>
      ))}
    </div>
  );
}

export function SelfPortrait({
  chart,
  questionnaire,
  fullPage = false,
  onTalk,
}: {
  chart: Profile["chart"];
  questionnaire?: QuestionnaireAnswers;
  fullPage?: boolean;
  onTalk?: () => void;
}) {
  const t = useT();
  const portrait = deriveSelfPortrait(chart, { questionnaire, memoryPresent: false });
  const spirit = deriveSpirit(chart);

  if (fullPage) {
    return (
      <div className="flex flex-col gap-5 px-5 pb-24 pt-6">
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-4 flex h-[96px] w-[96px] items-center justify-center rounded-full"
            style={{ background: "var(--color-ink)" }}
          >
            <SpiritSigil element={spirit.dominantElement} size={48} />
          </div>
          <h1 className="font-serif text-[24px] font-black text-ink">{spirit.archetype}</h1>
          <p className="mt-2 max-w-[300px] text-[14px] leading-relaxed text-ink-2">{spirit.coreTension || portrait.note}</p>
        </div>

        <Card>
          <h2 className="mb-4 text-[15px] font-semibold text-ink-2">{t("chart.selfPortraitTitle")}</h2>
          <PortraitDimensions dimensions={portrait.dimensions} />
        </Card>

        <Card>
          <h2 className="mb-3 text-[15px] font-semibold text-ink-2">{t("spirit.portraitNoteTitle")}</h2>
          <p className="text-[14px] leading-relaxed text-ink-2">{portrait.note}</p>
        </Card>

        <button
          type="button"
          onClick={onTalk}
          className="h-[52px] w-full rounded-[var(--radius-button)] bg-cinnabar text-[16px] font-medium text-white"
        >
          {t("spirit.talkAboutPortrait")}
        </button>
      </div>
    );
  }

  return (
    <Card className="mb-6" topAccent={portrait.dominantElement as "wood" | "fire" | "earth" | "metal" | "water"}>
      <div className="mb-5 flex items-center gap-3">
        <SpiritSigil element={spirit.dominantElement} size={44} />
        <div className="min-w-0">
          <h3 className="font-serif text-[17px] font-semibold leading-tight">{t("chart.selfPortraitTitle")}</h3>
          <p className="mt-0.5 text-[12px] text-muted">{t("chart.selfPortraitSubtitle")}</p>
        </div>
      </div>
      <PortraitDimensions dimensions={portrait.dimensions} />
      <p className="mt-5 text-[13px] italic leading-relaxed text-muted">{portrait.note}</p>
    </Card>
  );
}
