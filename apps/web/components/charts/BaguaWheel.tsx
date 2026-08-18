"use client";

import { DIRECTIONS, DIRECTION_LABEL, type Direction, type DirectionVerdict } from "@eamvp/core";

/**
 * 八方位盘图（EP-fs-07）——「境」页视觉主体。
 * 八扇区按吉凶着色；确定性数据驱动，来自 core 查表结果，不依赖 LLM，
 * 保证「LLM 挂了页面不白」——本组件独立成立，无需任何叙述文本。
 *
 * 与 ZiweiBoard / NatalWheel / WuxingRadar 同为 components/charts/ 下的可视化，
 * 配色一律走 CSS 变量令牌，不硬编码颜色值（项目在 TG 暗色主题上栽过硬编码色值的跟头）。
 *
 * 2026-08 设计评审后续（feat/fengshui-ui）：
 * - 星名垫 paper 底小 pill（critique P0：星名压在扇区混色底上实测 1.48–3.39:1，
 *   自称的「吉凶冗余通道」本身读不清；pill 后朱砂/灰字对 paper 底 ≈4.5–6:1）；
 * - `onSelectDirection` + `selectedDirection`：扇区可点（盘即导航，点扇区过滤化解）；
 * - `staggerIn`：首次揭晓时扇区按吉凶 rank 错峰淡入（首揭仪式的一部分）；
 * - `silhouette`：剪影模式——只有结构、无吉凶无色阶无文字，用于付费墙占位
 *   （「看得见形状、看不清内容」；不携带任何会员层数据，非会员浏览器可安全渲染）。
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

/**
 * 深浅随 rank 分级：1（最吉/最凶）最深，向 4 递浅。
 *
 * ⚠️ 区间下限不能再压低。初版用 0.30−0.05r / 0.16−0.02r，把令牌值对两种主题背景
 * 做 alpha 混合后实测：凶方四档相邻仅差 ~4 个 RGB 单位、首末跨度 ~12，低于可感知阈值，
 * 等于 rank 分级白做。现区间实测相邻 9–14、跨度 28–40（暗底与浅底均成立）。
 */
function sectorOpacity(v: DirectionVerdict): number {
  return v.auspicious ? 0.46 - v.rank * 0.07 : 0.34 - v.rank * 0.05;
}

/** 星名 pill 尺寸：八星名均为两个汉字（生气/天医/延年/伏位/绝命/五鬼/六煞/祸害），定宽即可。 */
const PILL_W = 36;
const PILL_H = 18;

/** 错峰入场顺序：最吉（生气）先落，按「吉 rank 1→4、再凶 rank 1→4」排序。 */
function staggerDelay(v: DirectionVerdict): number {
  const order = v.auspicious ? v.rank - 1 : 4 + (v.rank - 1);
  return order * 90;
}

/**
 * 评审后续 Minor：props 改判别联合——`silhouette: true` 时 `verdicts` 必须传 null
 * （剪影不携带任何真实吉凶数据）；非剪影时 `verdicts` 必传。类型层面恢复保证，
 * 不再有 `verdicts!` 非空断言（传 null 又不传 silhouette 的调用方会在编译期报错，
 * 而不是运行时 TypeError）。
 */
type BaguaWheelProps = {
  centerLabel: string;
  size?: number;
  /**
   * EP-fs-15：Layer 1 时页面同时渲染本命八方与房屋八方两个盘，默认标签相同会让
   * `getByLabelText` 等按无障碍标签定位的查询/辅助技术无法区分两者。默认值保持
   * 波1 的字面量不变，向后兼容所有既有调用方；仅第二个盘实例需要显式传入。
   */
  ariaLabel?: string;
  /** 盘即导航（2026-08 创意 A）：传入后扇区可点/可键盘触发，选中扇区描朱砂边。 */
  onSelectDirection?: (d: Direction) => void;
  selectedDirection?: Direction | null;
  /** 首揭仪式：扇区按吉凶 rank 错峰淡入一次。仅首次渲染时传 true。 */
  staggerIn?: boolean;
} & (
  | {
      /** 付费墙剪影：只有结构，无吉凶、无色阶、无文字。 */
      silhouette: true;
      /** 剪影模式传 null（不携带任何真实吉凶数据）。 */
      verdicts: null;
    }
  | {
      silhouette?: false;
      verdicts: Record<Direction, DirectionVerdict>;
    }
);

export function BaguaWheel(props: BaguaWheelProps) {
  const {
    centerLabel,
    size = 320,
    ariaLabel = "八方吉凶盘",
    onSelectDirection,
    selectedDirection = null,
    staggerIn = false,
  } = props;
  if (props.silhouette) {
    return (
      <svg viewBox="0 0 320 320" width={size} height={size} aria-hidden data-testid="bagua-silhouette">
        {DIRECTIONS.map((d, i) => (
          <path
            key={d}
            d={sectorPath(i)}
            fill="var(--color-ink)"
            fillOpacity={0.08}
            stroke="var(--color-line)"
            strokeWidth={1}
          />
        ))}
        <circle cx={CX} cy={CY} r={R_IN - 4} fill="var(--color-surface)" stroke="var(--color-line)" />
        <text
          x={CX}
          y={CY + 8}
          textAnchor="middle"
          style={{ fontFamily: "var(--font-serif)", fontSize: 24, fill: "var(--color-muted)" }}
        >
          宅
        </text>
      </svg>
    );
  }

  const v0 = props.verdicts;
  const interactive = !!onSelectDirection;

  // 评审 I2：可交互扇区是 <g role="button">，不能嵌在 role="img" 里——ARIA 1.2 规定
  // img 是 children-presentational，用户代理必须不暴露其后代，屏幕阅读器会完全
  // 看不见这 8 个按钮。可交互时 svg 用 role="group"（aria-label 保留），
  // 非交互（纯展示）时保持 role="img"。
  return (
    <svg viewBox="0 0 320 320" width={size} height={size} role={interactive ? "group" : "img"} aria-label={ariaLabel}>
      {DIRECTIONS.map((d, i) => {
        const v = v0[d];
        const [lx, ly] = polar((R_OUT + R_IN) / 2, i * 45);
        const selected = selectedDirection === d;
        const sectorAria = `${DIRECTION_LABEL[d]}：${v.star}（${v.auspicious ? "吉" : "凶"}）`;
        return (
          <g
            key={d}
            aria-label={sectorAria}
            className={interactive ? "zj-wheel-focus" : undefined}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-pressed={interactive ? selected : undefined}
            onClick={interactive ? () => onSelectDirection(d) : undefined}
            onKeyDown={
              interactive
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectDirection(d);
                    }
                  }
                : undefined
            }
            style={{
              cursor: interactive ? "pointer" : undefined,
              ...(staggerIn
                ? { animation: "zjFade .5s ease both", animationDelay: `${staggerDelay(v)}ms` }
                : {}),
            }}
          >
            <path
              d={sectorPath(i)}
              fill={sectorColor(v)}
              fillOpacity={sectorOpacity(v)}
              stroke={selected ? "var(--color-cinnabar)" : "var(--color-line)"}
              strokeWidth={selected ? 2.5 : 1}
            />
            <text
              x={lx}
              y={ly - 7}
              textAnchor="middle"
              style={{ fontFamily: "var(--font-serif)", fontSize: 15, fill: "var(--color-ink)" }}
            >
              {DIRECTION_LABEL[d]}
            </text>
            {/* 星名垫 paper 底 pill：混色扇区底上文字实测不可读（critique P0）。
                pill 只垫不遮，纸色微透，朱砂/灰字对纸底对比度过 AA。 */}
            <rect
              x={lx - PILL_W / 2}
              y={ly + 2}
              width={PILL_W}
              height={PILL_H}
              rx={PILL_H / 2}
              fill="var(--color-paper)"
              fillOpacity={0.92}
            />
            <text
              x={lx}
              y={ly + 11}
              textAnchor="middle"
              dominantBaseline="central"
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
