"use client";

import type { BaziChart, Pillar } from "@eamvp/core";
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
  const { key, labelKey, pillar, isDay } = col;
  const tenGod = isDay ? t("chart.dayMaster") : pillar.tenGodStem ?? "—";
  const hidden = pillar.hiddenStems.length > 0 ? pillar.hiddenStems.join(" ") : "—";

  return (
    <div
      data-testid={`pillar-col-${key}`}
      className="flex min-w-[64px] flex-1 flex-col items-center gap-1.5 py-4"
    >
      {/* 十神 / 日主（muted 小字） */}
      <div className="text-muted text-[11px]">{tenGod}</div>
      {/* 天干：宋体大字 */}
      <div
        className="text-ink leading-none"
        style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(30px, 7vw, 34px)" }}
      >
        {pillar.stem}
      </div>
      {/* 地支：宋体大字 */}
      <div
        className="text-ink leading-none"
        style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(30px, 7vw, 34px)" }}
      >
        {pillar.branch}
      </div>
      {/* 藏干（muted 小字） */}
      <div className="text-muted text-center text-[11px] leading-tight">{hidden}</div>
      {/* 柱名标签：年/月/时 为 muted 小字；日柱加一枚朱砂白文方章「主」 */}
      <div className="mt-1 flex items-center gap-1.5">
        <span className="text-muted text-[11px]">{t(labelKey)}</span>
        {isDay && (
          <span
            data-testid="bazi-day-seal"
            role="img"
            aria-label={t("chart.dayMaster")}
            className="inline-flex items-center justify-center leading-none"
            style={{
              width: 22,
              height: 22,
              borderRadius: "var(--radius-seal)",
              background: "var(--color-cinnabar)",
              color: "var(--color-paper)",
              fontFamily: "var(--font-serif)",
              fontSize: 13,
            }}
          >
            主
          </span>
        )}
      </div>
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

  return (
    <div className="text-ink">
      {/* 四柱：整组上下各一条 1px 细线，内部横排四列 */}
      <div
        data-testid="bazi-pillars-grid"
        style={{
          borderTop: "1px solid var(--color-line)",
          borderBottom: "1px solid var(--color-line)",
        }}
      >
        <div className="flex flex-wrap items-stretch">
          {columns.map((col) => (
            <PillarColumn key={col.key} col={col} />
          ))}
        </div>
      </div>

      {/* 汇总条 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
        {/* 日主（单 accent 原则：不再用五行语义色着字符） */}
        <div className="flex items-baseline gap-2">
          <span className="text-muted text-[11px]">{t("chart.dayMaster")}</span>
          <span className="text-[15px]">
            {bazi.dayMaster}
            {bazi.dayMasterElement ? `·${bazi.dayMasterElement}` : ""}
          </span>
        </div>

        {/* 旺衰 */}
        <div className="flex items-baseline gap-2">
          <span className="text-muted text-[11px]">{t("chart.strength")}</span>
          <span className="text-[15px]">{strengthLabel[bazi.dayMasterStrength]}</span>
        </div>

        {/* 五行计数：细边 chip（1px line、无底色填充，元素名墨色） */}
        <div className="flex items-center gap-1.5">
          <span className="text-muted mr-1 text-[11px]">{t("chart.fiveElements")}</span>
          {WUXING_ORDER.map(({ countKey, elementKey, i18nKey }) => {
            const count = bazi.fiveElementCounts[countKey] ?? 0;
            return (
              <span
                key={elementKey}
                data-testid={`wuxing-chip-${elementKey}`}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[12px]"
                style={{
                  borderRadius: "var(--radius-chip)",
                  border: "1px solid var(--color-line)",
                  background: "transparent",
                }}
              >
                <span className="text-ink">{t(i18nKey)}</span>
                <span className="text-muted tabular-nums">{count}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
