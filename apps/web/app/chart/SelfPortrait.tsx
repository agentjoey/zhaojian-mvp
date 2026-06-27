"use client";

import { deriveSelfPortrait, deriveSpirit } from "@eamvp/core";
import type { QuestionnaireAnswers } from "@eamvp/core";
import type { Profile } from "@/lib/profiles";
import { Card } from "@/components/ui";
import { SpiritSigil } from "./SpiritSigil";

export function SelfPortrait({
  chart,
  questionnaire,
}: {
  chart: Profile["chart"];
  questionnaire?: QuestionnaireAnswers;
}) {
  const portrait = deriveSelfPortrait(chart, { questionnaire, memoryPresent: false });
  const spirit = deriveSpirit(chart);
  const accentVar = `var(--color-${portrait.dominantElement})`;

  return (
    <Card className="mb-6" topAccent={portrait.dominantElement as "wood" | "fire" | "earth" | "metal" | "water"}>
      <div className="mb-5 flex items-center gap-3">
        <SpiritSigil element={spirit.dominantElement} size={44} />
        <div className="min-w-0">
          <h3 className="font-serif text-[17px] font-semibold leading-tight">自我画像 · Self-Portrait</h3>
          <p className="mt-0.5 text-[12px] text-muted">
            由命盘结构与自我自陈合成的内在侧写
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {portrait.dimensions.map((dim) => (
          <div key={dim.key} className="grid grid-cols-[80px_1fr_28px] items-center gap-3 sm:grid-cols-[96px_1fr_28px]">
            <span className="text-[13px] text-ink-2">{dim.label}</span>
            <div
              className="h-2 overflow-hidden rounded-full"
              style={{ background: "var(--color-line)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${dim.value * 10}%`, background: accentVar }}
              />
            </div>
            <span className="text-right text-[13px] tabular-nums text-muted">{dim.value}</span>
          </div>
        ))}
      </div>

      <p className="mt-5 text-[13px] italic leading-relaxed text-muted">
        {portrait.note}
      </p>
    </Card>
  );
}
