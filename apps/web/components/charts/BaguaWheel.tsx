"use client";

import { DIRECTIONS, DIRECTION_GUA, DIRECTION_LABEL, type Direction, type DirectionVerdict } from "@eamvp/core";

/**
 * 八方位盘图（EP-fs-07）——「境」页视觉主体。
 * 确定性数据驱动，来自 core 查表结果，不依赖 LLM，
 * 保证「LLM 挂了页面不白」——本组件独立成立，无需任何叙述文本。
 *
 * 与 ZiweiBoard / NatalWheel / WuxingRadar 同为 components/charts/ 下的可视化，
 * 配色一律走 CSS 变量令牌，不硬编码颜色值（项目在 TG 暗色主题上栽过硬编码色值的跟头）。
 *
 * EP-east-ui-r2（S5 细环卦字版，对齐已确认的 Pencil 设计稿）：
 * 由「填充扇区 + 星名 pill」重绘为「双细环 + 八方正位卦字」——
 * - 无扇区填充、无 pill：外环 1px line-strong、内环 1px line，吉凶全靠卦字
 *   颜色/字重表达（四吉 ink 600、生气方朱砂、四凶 muted 400——凶方用 muted
 *   而非更浅的色，是为过 AA 4.5:1；浅色文字是上一轮评审的红线）；
 * - 卦字与方位的对应取自 core 的 DIRECTION_GUA（后天八卦定位），不自己发明映射；
 * - 四吉方位卦字下加星名小字（生气朱砂、其余三吉 muted）；凶方不出星名；
 * - 交互模型不变：`onSelectDirection`/`selectedDirection`/`staggerIn`/`silhouette`
 *   四个 prop 的 API 与语义均未动，点击目标从扇区变为卦字所在的 <g>，
 *   可访问名称保持「方位：星名（吉/凶）」格式；选中态 = 卦字变朱砂 + 向心侧
 *   2px 朱砂短划线；`staggerIn` 错峰移到卦字上，delay 序列语义不变（生气 0ms 起）；
 * - `silhouette`（付费墙剪影）适配新皮肤：卦字渲染为墨色占位块，
 *   逻辑不变（verdicts=null，不携带任何会员层数据）。
 */

const CX = 160;
const CY = 160;
/** 双细环：外环 line-strong、内环 line。 */
const RING_OUT = 150;
const RING_IN = 96;
/** 卦字在双环环带中央的半径；短划线与星名小字在卦字向心一侧。 */
const GUA_R = 126;
const DASH_R = 112;
const STAR_R = 101;
/** 中心宅卦圆（保留旧皮肤的几何）。 */
const CENTER_R = 54;

/** 半径 r、角度 deg（顺时针，0° = 正上方/正北）处的屏幕坐标。 */
function polar(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

/** 方位角 deg 处的切向单位向量（与半径垂直），用来画选中态的短划线。 */
function tangent(deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [-Math.sin(rad), Math.cos(rad)];
}

/**
 * 卦字着色：四凶 muted 400；四吉 ink 600，其中生气方朱砂。
 * 凶方坚持 muted（≈4.8:1）不用更浅的色阶——浅色文字是上一轮评审踩过的红线。
 */
function guaColor(v: DirectionVerdict): string {
  if (!v.auspicious) return "var(--color-muted)";
  return v.star === "生气" ? "var(--color-cinnabar)" : "var(--color-ink)";
}

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
  /** 盘即导航（2026-08 创意 A）：传入后卦字可点/可键盘触发，选中方位卦字变朱砂 + 短划线。 */
  onSelectDirection?: (d: Direction) => void;
  selectedDirection?: Direction | null;
  /** 首揭仪式：卦字按吉凶 rank 错峰淡入一次。仅首次渲染时传 true。 */
  staggerIn?: boolean;
} & (
  | {
      /** 付费墙剪影：只有结构，无吉凶、无卦字、无文字。 */
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
        <circle cx={CX} cy={CY} r={RING_OUT} fill="none" stroke="var(--color-line)" strokeWidth={1} />
        <circle cx={CX} cy={CY} r={RING_IN} fill="none" stroke="var(--color-line)" strokeWidth={1} />
        {/* 卦字的墨色占位块：「看得见形状、看不清内容」，不含任何吉凶信息。 */}
        {DIRECTIONS.map((d, i) => {
          const [bx, by] = polar(GUA_R, i * 45);
          return (
            <rect
              key={d}
              x={bx - 9}
              y={by - 9}
              width={18}
              height={18}
              rx={2}
              fill="var(--color-ink)"
              fillOpacity={0.1}
            />
          );
        })}
        <circle cx={CX} cy={CY} r={CENTER_R} fill="var(--color-surface)" stroke="var(--color-line)" />
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

  // 评审 I2：可交互卦字是 <g role="button">，不能嵌在 role="img" 里——ARIA 1.2 规定
  // img 是 children-presentational，用户代理必须不暴露其后代，屏幕阅读器会完全
  // 看不见这 8 个按钮。可交互时 svg 用 role="group"（aria-label 保留），
  // 非交互（纯展示）时保持 role="img"。
  return (
    <svg viewBox="0 0 320 320" width={size} height={size} role={interactive ? "group" : "img"} aria-label={ariaLabel}>
      <circle cx={CX} cy={CY} r={RING_OUT} fill="none" stroke="var(--color-line-strong)" strokeWidth={1} />
      <circle cx={CX} cy={CY} r={RING_IN} fill="none" stroke="var(--color-line)" strokeWidth={1} />
      {DIRECTIONS.map((d, i) => {
        const v = v0[d];
        const deg = i * 45;
        const [gx, gy] = polar(GUA_R, deg);
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
            <text
              x={gx}
              y={gy}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 22,
                fontWeight: v.auspicious ? 600 : 400,
                fill: selected ? "var(--color-cinnabar)" : guaColor(v),
              }}
            >
              {DIRECTION_GUA[d]}
            </text>
            {/* 四吉方位在卦字向心侧标注星名小字：生气朱砂，天医/延年/伏位 muted。
                凶方不出星名——吉凶冗余通道由卦字颜色/字重承担。 */}
            {v.auspicious &&
              (() => {
                const [sx, sy] = polar(STAR_R, deg);
                return (
                  <text
                    x={sx}
                    y={sy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.2em",
                      fill: v.star === "生气" ? "var(--color-cinnabar)" : "var(--color-muted)",
                    }}
                  >
                    {v.star}
                  </text>
                );
              })()}
            {/* 选中态：卦字已变朱砂，再在向心侧补一条 2px 朱砂短划线（沿切向）。 */}
            {selected &&
              (() => {
                const [dx, dy] = polar(DASH_R, deg);
                const [tx, ty] = tangent(deg);
                return (
                  <line
                    x1={dx - tx * 10}
                    y1={dy - ty * 10}
                    x2={dx + tx * 10}
                    y2={dy + ty * 10}
                    stroke="var(--color-cinnabar)"
                    strokeWidth={2}
                  />
                );
              })()}
          </g>
        );
      })}
      <circle cx={CX} cy={CY} r={CENTER_R} fill="var(--color-surface)" stroke="var(--color-line)" />
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
