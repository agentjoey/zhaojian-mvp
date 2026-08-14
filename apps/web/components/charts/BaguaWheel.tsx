"use client";

import { DIRECTIONS, DIRECTION_LABEL, type Direction, type DirectionVerdict } from "@eamvp/core";

/**
 * 八方位盘图（EP-fs-07）——「境」页视觉主体。
 * 八扇区按吉凶着色；确定性数据驱动，来自 core 查表结果，不依赖 LLM，
 * 保证「LLM 挂了页面不白」——本组件独立成立，无需任何叙述文本。
 *
 * 与 ZiweiBoard / NatalWheel / WuxingRadar 同为 components/charts/ 下的可视化，
 * 配色一律走 CSS 变量令牌，不硬编码颜色值（项目在 TG 暗色主题上栽过硬编码色值的跟头）。
 */

const R_OUT = 150;
const R_IN = 58;
const CX = 160;
const CY = 160;

/** 半径 r、角度 deg（顺时针，0° = 正上方/正北）处的屏幕坐标。 */
function polar(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

/** 第 index 个方位（顺时针自正北起）的扇形路径，45° 一格。 */
function sectorPath(index: number): string {
  const half = 22.5;
  const mid = index * 45;
  const a0 = mid - half;
  const a1 = mid + half;
  const [x0, y0] = polar(R_OUT, a0);
  const [x1, y1] = polar(R_OUT, a1);
  const [x2, y2] = polar(R_IN, a1);
  const [x3, y3] = polar(R_IN, a0);
  return `M ${x0} ${y0} A ${R_OUT} ${R_OUT} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${R_IN} ${R_IN} 0 0 0 ${x3} ${y3} Z`;
}

/** 吉方朱色（cinnabar）、凶方墨色（ink）——两条色阶互不相同，一眼可辨。 */
function sectorColor(v: DirectionVerdict): string {
  return v.auspicious ? "var(--color-cinnabar)" : "var(--color-ink)";
}

/** 深浅随 rank 分级：1（最吉/最凶）最深，向 4 递浅。 */
function sectorOpacity(v: DirectionVerdict): number {
  return v.auspicious ? 0.3 - v.rank * 0.05 : 0.16 - v.rank * 0.02;
}

export function BaguaWheel({
  verdicts,
  centerLabel,
  size = 320,
}: {
  verdicts: Record<Direction, DirectionVerdict>;
  centerLabel: string;
  size?: number;
}) {
  return (
    <svg viewBox="0 0 320 320" width={size} height={size} role="img" aria-label="八方吉凶盘">
      {DIRECTIONS.map((d, i) => {
        const v = verdicts[d];
        const [lx, ly] = polar((R_OUT + R_IN) / 2, i * 45);
        return (
          <g key={d} aria-label={`${DIRECTION_LABEL[d]}：${v.star}（${v.auspicious ? "吉" : "凶"}）`}>
            <path
              d={sectorPath(i)}
              fill={sectorColor(v)}
              fillOpacity={sectorOpacity(v)}
              stroke="var(--color-line)"
              strokeWidth={1}
            />
            <text
              x={lx}
              y={ly - 7}
              textAnchor="middle"
              style={{ fontFamily: "var(--font-serif)", fontSize: 15, fill: "var(--color-ink)" }}
            >
              {DIRECTION_LABEL[d]}
            </text>
            <text
              x={lx}
              y={ly + 12}
              textAnchor="middle"
              style={{ fontSize: 12, fill: v.auspicious ? "var(--color-cinnabar)" : "var(--color-muted)" }}
            >
              {v.star}
            </text>
          </g>
        );
      })}
      <circle cx={CX} cy={CY} r={R_IN - 4} fill="var(--color-surface)" stroke="var(--color-line)" />
      <text
        x={CX}
        y={CY + 8}
        textAnchor="middle"
        style={{ fontFamily: "var(--font-serif)", fontSize: 24, fill: "var(--color-ink)" }}
      >
        {centerLabel}
      </text>
    </svg>
  );
}
