"use client";

import type { BaziChart, Pillar } from "@eamvp/core";
import {
  GanzhiBadge,
  WUXING_LABEL_TO_KEY,
  cn,
} from "@/components/ui";
import { useT } from "@/lib/i18n/I18nProvider";

// 五行计数小芯片的固定顺序：木火土金水
const WUXING_ORDER: { countKey: string; elementKey: string; i18nKey: string }[] = [
  { countKey: "木", elementKey: "wood", i18nKey: "chart.elementWood" },
  { countKey: "火", elementKey: "fire", i18nKey: "chart.elementFire" },
  { countKey: "土", elementKey: "earth", i18nKey: "chart.elementEarth" },
  { countKey: "金", elementKey: "metal", i18nKey: "chart.elementMetal" },
  { countKey: "水", elementKey: "water", i18nKey: "chart.elementWater" },
];

type ColumnDef = { key: string; labelKey: string; pillar: Pillar; isDay: boolean };

function PillarColumn({ col }: { col: ColumnDef }) {
  const t = useT();
  const { labelKey, pillar, isDay } = col;
  const tenGod = isDay ? t("chart.dayMaster") : pillar.tenGodStem ?? "—";
  const hidden = pillar.hiddenStems.length > 0 ? pillar.hiddenStems.join(" ") : "—";

  const body = (
    <div className="flex min-w-[64px] flex-1 flex-col items-center gap-2 py-3">
      {/* 柱名 年/月/日/时 */}
      <div
        className={cn("text-[12px]", isDay ? "opacity-80" : "text-muted")}
      >
        {t(labelKey)}
      </div>
      {/* 十神 / 日主 */}
      <div
        className={cn(
          "text-[11px]",
          isDay ? "opacity-70" : "text-muted",
        )}
      >
        {tenGod}
      </div>
      {/* 天干 */}
      <GanzhiBadge char={pillar.stem} highlight={isDay} size={44} />
      {/* 地支 */}
      <GanzhiBadge char={pillar.branch} size={44} />
      {/* 藏干 */}
      <div
        className={cn(
          "text-center text-[11px] leading-tight",
          isDay ? "opacity-70" : "text-muted",
        )}
      >
        {hidden}
      </div>
    </div>
  );

  if (!isDay) return body;

  // 日柱：深色锚点
  return (
    <div
      style={{
        background: "var(--color-panel-strong)",
        color: "var(--color-on-strong)",
        borderRadius: "var(--radius-card)",
      }}
    >
      {body}
    </div>
  );
}

export function BaziPillars({ bazi }: { bazi: BaziChart }) {
  const t = useT();
  const { pillars } = bazi;

  const strengthLabel: Record<BaziChart["dayMasterStrength"], string> = {
    strong: t("chart.strengthStrong"),
    weak: t("chart.strengthWeak"),
    balanced: t("chart.strengthBalanced"),
    unknown: t("chart.strengthUnknown"),
  };

  const columns: ColumnDef[] = [
    { key: "year", labelKey: "chart.pillarYear", pillar: pillars.year, isDay: false },
    { key: "month", labelKey: "chart.pillarMonth", pillar: pillars.month, isDay: false },
    { key: "day", labelKey: "chart.pillarDay", pillar: pillars.day, isDay: true },
  ];
  if (pillars.hour) {
    columns.push({ key: "hour", labelKey: "chart.pillarHour", pillar: pillars.hour, isDay: false });
  }

  const dmKey = WUXING_LABEL_TO_KEY[bazi.dayMasterElement];
  const dmColor = dmKey ? `var(--color-${dmKey})` : "var(--color-ink)";

  return (
    <div className="bg-surface text-ink" style={{ borderRadius: "var(--radius-card)" }}>
      {/* 四柱 */}
      <div className="flex flex-wrap items-stretch gap-2 px-2">
        {columns.map((col) => (
          <PillarColumn key={col.key} col={col} />
        ))}
      </div>

      {/* 汇总条 */}
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-3 py-4">
        {/* 日主 */}
        <div className="flex items-baseline gap-2">
          <span className="text-muted text-[11px]">{t("chart.dayMaster")}</span>
          <span className="text-[15px]" style={{ color: dmColor }}>
            {bazi.dayMaster}
            {bazi.dayMasterElement ? `·${bazi.dayMasterElement}` : ""}
          </span>
        </div>

        {/* 旺衰 */}
        <div className="flex items-baseline gap-2">
          <span className="text-muted text-[11px]">{t("chart.strength")}</span>
          <span className="text-[15px]">{strengthLabel[bazi.dayMasterStrength]}</span>
        </div>

        {/* 五行计数 */}
        <div className="flex items-center gap-1.5">
          <span className="text-muted mr-1 text-[11px]">{t("chart.fiveElements")}</span>
          {WUXING_ORDER.map(({ countKey, elementKey, i18nKey }) => {
            const count = bazi.fiveElementCounts[countKey] ?? 0;
            return (
              <span
                key={elementKey}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[12px]"
                style={{
                  borderRadius: "var(--radius-chip)",
                  background: `var(--color-${elementKey})`,
                  color: `var(--color-on-${elementKey})`,
                }}
              >
                <span>{t(i18nKey)}</span>
                <span className="tabular-nums">{count}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
