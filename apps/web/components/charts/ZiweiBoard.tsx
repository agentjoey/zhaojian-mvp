import type { ZiweiChart, Palace, Star } from "@eamvp/core";
import { MutagenTag, cn } from "@/components/ui";

/**
 * 照见 · 紫微星盘（presentational, data-driven, NO recomputation）
 *
 * 固定地支布局（4×4 网格，中心 2×2 合并为命主信息锚点）：
 *   巳 午 未 申
 *   辰 ▦  ▦ 酉
 *   卯 ▦  ▦ 戌
 *   寅 丑 子 亥
 * 宫位按 palace.branch 落位（非数组顺序）。
 */

// 地支 → 网格坐标（row/col，1-indexed）。
const BRANCH_CELL: Record<string, { row: number; col: number }> = {
  巳: { row: 1, col: 1 }, 午: { row: 1, col: 2 }, 未: { row: 1, col: 3 }, 申: { row: 1, col: 4 },
  辰: { row: 2, col: 1 },                                                  酉: { row: 2, col: 4 },
  卯: { row: 3, col: 1 },                                                  戌: { row: 3, col: 4 },
  寅: { row: 4, col: 1 }, 丑: { row: 4, col: 2 }, 子: { row: 4, col: 3 }, 亥: { row: 4, col: 4 },
};

const MUTAGEN_ORDER = ["禄", "权", "科", "忌"] as const;

function PalaceCell({ palace }: { palace: Palace }) {
  const pos = BRANCH_CELL[palace.branch];
  if (!pos) return null;

  // 收集本宫所有四化（去重、固定顺序），用于右上角标签。
  const allStars: Star[] = [...palace.majorStars, ...palace.minorStars, ...palace.adjectiveStars];
  const mutagens = MUTAGEN_ORDER.filter((k) => allStars.some((s) => s.mutagen === k));

  return (
    <div
      className="relative flex flex-col bg-surface border-line"
      style={{
        gridRow: pos.row,
        gridColumn: pos.col,
        minHeight: 78,
        padding: 8,
        borderWidth: 1,
        borderStyle: "solid",
        borderRadius: "var(--radius-card)",
        boxShadow: palace.isBodyPalace ? "inset 0 0 0 1.5px var(--color-seal)" : undefined,
      }}
    >
      {/* 顶部：宫名（左）+ 四化标签（右）*/}
      <div className="flex items-start justify-between gap-1">
        <span
          className="text-ink leading-tight"
          style={{ fontWeight: 600, fontSize: "clamp(11px, 2.6vw, 13px)" }}
        >
          {palace.name}
          {palace.isBodyPalace && (
            <span className="ml-1 align-middle" style={{ color: "var(--color-seal)", fontSize: "0.78em" }}>
              身
            </span>
          )}
        </span>
        {mutagens.length > 0 && (
          <span className="flex shrink-0 flex-wrap justify-end gap-0.5">
            {mutagens.map((k) => (
              <MutagenTag key={k} kind={k} />
            ))}
          </span>
        )}
      </div>

      {/* 主星 */}
      <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5">
        {palace.majorStars.map((s, i) => (
          <span
            key={`maj-${i}`}
            className="text-ink leading-snug"
            style={{ fontSize: "clamp(11px, 2.6vw, 13px)", fontWeight: 500 }}
          >
            {s.name}
            {s.brightness && (
              <span className="text-muted" style={{ fontSize: "0.78em" }}>
                {s.brightness}
              </span>
            )}
          </span>
        ))}
      </div>

      {/* 辅星 / 杂曜（弱化）*/}
      {(palace.minorStars.length > 0 || palace.adjectiveStars.length > 0) && (
        <div className="mt-0.5 flex flex-wrap gap-x-1 gap-y-0 text-muted leading-snug" style={{ fontSize: "clamp(9px, 2.2vw, 11px)" }}>
          {palace.minorStars.map((s, i) => (
            <span key={`min-${i}`}>{s.name}</span>
          ))}
          {palace.adjectiveStars.map((s, i) => (
            <span key={`adj-${i}`} style={{ opacity: 0.8 }}>
              {s.name}
            </span>
          ))}
        </div>
      )}

      {/* 地支（右下，拉丁小标气质）*/}
      <span
        className="latin-label absolute text-muted"
        style={{ right: 8, bottom: 6, fontSize: "clamp(10px, 2.4vw, 12px)", letterSpacing: "0.12em" }}
      >
        {palace.branch}
      </span>
    </div>
  );
}

function CenterCell({ ziwei }: { ziwei: ZiweiChart }) {
  const facts: { label: string; value: string }[] = [
    { label: "命宫", value: ziwei.soulPalaceBranch },
    { label: "身宫", value: ziwei.bodyPalaceBranch },
    { label: "五行局", value: ziwei.fiveElementBureau },
  ];
  return (
    <div
      className="bg-ink text-on-ink flex flex-col justify-center gap-3"
      style={{
        gridRow: "2 / span 2",
        gridColumn: "2 / span 2",
        borderRadius: "var(--radius-card)",
        padding: "clamp(10px, 2.4vw, 16px)",
      }}
    >
      <div className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-1.5">
        {facts.map((f) => (
          <span key={f.label} className="inline-flex items-baseline gap-1">
            <span className="text-on-ink-gold" style={{ fontSize: "clamp(9px, 2vw, 11px)" }}>
              {f.label}
            </span>
            <span style={{ fontSize: "clamp(12px, 2.8vw, 15px)", fontWeight: 600 }}>{f.value}</span>
          </span>
        ))}
      </div>

      <div className="mx-auto" style={{ height: 1, width: "60%", background: "var(--color-on-ink-faint)", opacity: 0.5 }} />

      {/* 生年四化 */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-on-ink-gold" style={{ fontSize: "clamp(9px, 2vw, 11px)" }}>
          生年四化
        </span>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {MUTAGEN_ORDER.map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <MutagenTag kind={k} />
              <span style={{ fontSize: "clamp(11px, 2.5vw, 13px)" }}>{ziwei.birthMutagens[k]}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ZiweiBoard({ ziwei }: { ziwei: ZiweiChart }) {
  return (
    <div
      className={cn("grid w-full aspect-square")}
      style={{
        gridTemplateColumns: "repeat(4, 1fr)",
        gridTemplateRows: "repeat(4, 1fr)",
        gap: 6,
        fontFamily: "var(--font-serif)",
      }}
    >
      {ziwei.palaces.map((p, i) => (
        <PalaceCell key={`${p.branch}-${i}`} palace={p} />
      ))}
      <CenterCell ziwei={ziwei} />
    </div>
  );
}
