import type { BaziChart, Pillar } from "@eamvp/core";
import {
  GanzhiBadge,
  WUXING_LABEL_TO_KEY,
  cn,
} from "@/components/ui";

const STRENGTH_LABEL: Record<BaziChart["dayMasterStrength"], string> = {
  strong: "身强",
  weak: "身弱",
  balanced: "中和",
  unknown: "—",
};

// 五行计数小芯片的固定顺序：木火土金水
const WUXING_ORDER: (keyof typeof WUXING_LABEL_TO_KEY)[] = ["木", "火", "土", "金", "水"];

type ColumnDef = { key: string; label: string; pillar: Pillar; isDay: boolean };

function PillarColumn({ col }: { col: ColumnDef }) {
  const { label, pillar, isDay } = col;
  const tenGod = isDay ? "日主" : pillar.tenGodStem ?? "—";
  const hidden = pillar.hiddenStems.length > 0 ? pillar.hiddenStems.join(" ") : "—";

  const body = (
    <div className="flex min-w-[64px] flex-1 flex-col items-center gap-2 py-3">
      {/* 柱名 年/月/日/时 */}
      <div
        className={cn("text-[12px]", isDay ? "opacity-80" : "text-muted")}
      >
        {label}
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
        background: "var(--color-ink)",
        color: "var(--color-on-ink)",
        borderRadius: "var(--radius-card)",
      }}
    >
      {body}
    </div>
  );
}

export function BaziPillars({ bazi }: { bazi: BaziChart }) {
  const { pillars } = bazi;

  const columns: ColumnDef[] = [
    { key: "year", label: "年", pillar: pillars.year, isDay: false },
    { key: "month", label: "月", pillar: pillars.month, isDay: false },
    { key: "day", label: "日", pillar: pillars.day, isDay: true },
  ];
  if (pillars.hour) {
    columns.push({ key: "hour", label: "时", pillar: pillars.hour, isDay: false });
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
          <span className="text-muted text-[11px]">日主</span>
          <span className="text-[15px]" style={{ color: dmColor }}>
            {bazi.dayMaster}
            {bazi.dayMasterElement ? `·${bazi.dayMasterElement}` : ""}
          </span>
        </div>

        {/* 旺衰 */}
        <div className="flex items-baseline gap-2">
          <span className="text-muted text-[11px]">旺衰</span>
          <span className="text-[15px]">{STRENGTH_LABEL[bazi.dayMasterStrength]}</span>
        </div>

        {/* 五行计数 */}
        <div className="flex items-center gap-1.5">
          <span className="text-muted mr-1 text-[11px]">五行</span>
          {WUXING_ORDER.map((label) => {
            const key = WUXING_LABEL_TO_KEY[label];
            const count = bazi.fiveElementCounts[label] ?? 0;
            return (
              <span
                key={key}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[12px]"
                style={{
                  borderRadius: "var(--radius-chip)",
                  background: `var(--color-${key})`,
                  color: `var(--color-on-${key})`,
                }}
              >
                <span>{label}</span>
                <span className="tabular-nums">{count}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
