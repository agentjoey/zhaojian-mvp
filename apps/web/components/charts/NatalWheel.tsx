import type { WesternChart, Planet, Aspect } from "@eamvp/core";

// ── 静态查表（纯展示，无任何排盘推算）─────────────────────────────
// 黄道十二宫顺序（Aries→Pisces），index 即起始 30° 段。
const SIGN_ORDER = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
] as const;

const SIGN_INDEX: Record<string, number> = SIGN_ORDER.reduce(
  (acc, name, i) => ((acc[name] = i), acc),
  {} as Record<string, number>,
);

// 星座符号（U+2648..U+2653）；强制文本字形需追加变体选择符 U+FE0E。
const VS = "︎";
const SIGN_GLYPH: Record<string, string> = {
  Aries: "♈",
  Taurus: "♉",
  Gemini: "♊",
  Cancer: "♋",
  Leo: "♌",
  Virgo: "♍",
  Libra: "♎",
  Scorpio: "♏",
  Sagittarius: "♐",
  Capricorn: "♑",
  Aquarius: "♒",
  Pisces: "♓",
};

// 行星符号。
const PLANET_GLYPH: Record<string, string> = {
  Sun: "☉",
  Moon: "☽",
  Mercury: "☿",
  Venus: "♀",
  Mars: "♂",
  Jupiter: "♃",
  Saturn: "♄",
  Uranus: "♅",
  Neptune: "♆",
  Pluto: "♇",
};

// 行星中文名（列表用）。
const PLANET_CN: Record<string, string> = {
  Sun: "太阳",
  Moon: "月亮",
  Mercury: "水星",
  Venus: "金星",
  Mars: "火星",
  Jupiter: "木星",
  Saturn: "土星",
  Uranus: "天王",
  Neptune: "海王",
  Pluto: "冥王",
};

// ── 几何常量 ──────────────────────────────────────────────
const SIZE = 400;
const CX = SIZE / 2; // 200
const CY = SIZE / 2; // 200
const R_ZODIAC_OUTER = 190; // 黄道带外缘
const R_ZODIAC_INNER = 160; // 黄道带内缘 / 宫环外缘
const R_GLYPH_SIGN = 175; // 星座符号半径（黄道带中线）
const R_PLANET = 140; // 行星符号 / 相位连线半径
const R_HOUSE_INNER = 42; // 宫辐条收口（= 中心盘半径）
const R_CENTER = 42; // 中心暗盘

// 黄道经度 → 屏幕角度（度）。
// 升序经度逆时针；上升点置于左侧（屏幕 180°）。
function screenDeg(lon: number, ascLon: number): number {
  return 180 + (lon - ascLon);
}

// 极坐标 → 笛卡尔（y 轴向下，故取负 sin 使经度增加方向为逆时针）。
function polar(r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

// 绝对黄道经度。
function lonOf(sign: string, degree: number): number {
  return (SIGN_INDEX[sign] ?? 0) * 30 + degree;
}

const ASPECT_COLOR: Record<Aspect["quality"], string> = {
  hard: "var(--color-fire)",
  soft: "var(--color-water)",
  neutral: "var(--color-spoke)",
};

export function NatalWheel({ western }: { western: WesternChart | null }) {
  if (!western) return null;

  const { ascendant, midheaven, planets, aspects } = western;
  const ascLon = lonOf(ascendant.sign, ascendant.degree);

  // 行星屏幕坐标查找表（按英文名），供相位连线复用。
  const planetPos: Record<string, { x: number; y: number }> = {};
  for (const p of planets) {
    const lon = lonOf(p.sign, p.degree);
    planetPos[p.name] = polar(R_PLANET, screenDeg(lon, ascLon));
  }

  // 12 道星座分隔线（每段起点经度 = i*30），落在屏幕角度。
  const signSectors = SIGN_ORDER.map((sign, i) => {
    const startLon = i * 30;
    const midLon = startLon + 15;
    const divider = polar(R_ZODIAC_OUTER, screenDeg(startLon, ascLon));
    const dividerIn = polar(R_ZODIAC_INNER, screenDeg(startLon, ascLon));
    const glyphAt = polar(R_GLYPH_SIGN, screenDeg(midLon, ascLon));
    return { sign, divider, dividerIn, glyphAt };
  });

  // 12 宫辐条：整宫制 —— 第 1 宫以上升点经度起，每 30° 一宫。
  const houseSpokes = Array.from({ length: 12 }, (_, h) => {
    const lon = ascLon + h * 30; // 宫起始经度
    const outer = polar(R_ZODIAC_INNER, screenDeg(lon, ascLon));
    const inner = polar(R_HOUSE_INNER, screenDeg(lon, ascLon));
    return { outer, inner };
  });

  // Asc / MC 标记点。
  const ascLonAbs = ascLon;
  const mcLonAbs = lonOf(midheaven.sign, midheaven.degree);
  const angularPoints = [
    { label: "Asc", lon: ascLonAbs },
    { label: "MC", lon: mcLonAbs },
  ].map((a) => {
    const onRing = polar(R_ZODIAC_INNER, screenDeg(a.lon, ascLon));
    const tickOut = polar(R_ZODIAC_OUTER, screenDeg(a.lon, ascLon));
    const labelAt = polar(R_ZODIAC_OUTER + 8, screenDeg(a.lon, ascLon));
    return { ...a, onRing, tickOut, labelAt };
  });

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      {/* —— 命盘轮 —— */}
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="西方本命盘"
        style={{ width: "100%", height: "auto", maxWidth: 400 }}
      >
        {/* 黄道带内外圈 */}
        <circle cx={CX} cy={CY} r={R_ZODIAC_OUTER} fill="none" stroke="var(--color-spoke)" strokeWidth={1} />
        <circle cx={CX} cy={CY} r={R_ZODIAC_INNER} fill="none" stroke="var(--color-spoke)" strokeWidth={1} />

        {/* 星座分段线 */}
        {signSectors.map((s) => (
          <line
            key={`div-${s.sign}`}
            x1={s.divider.x}
            y1={s.divider.y}
            x2={s.dividerIn.x}
            y2={s.dividerIn.y}
            stroke="var(--color-spoke)"
            strokeWidth={1}
          />
        ))}

        {/* 宫辐条（内环 → 中心盘） */}
        {houseSpokes.map((sp, i) => (
          <line
            key={`spoke-${i}`}
            x1={sp.outer.x}
            y1={sp.outer.y}
            x2={sp.inner.x}
            y2={sp.inner.y}
            stroke="var(--color-spoke)"
            strokeWidth={1}
          />
        ))}

        {/* 星座符号 */}
        {signSectors.map((s) => (
          <text
            key={`glyph-${s.sign}`}
            x={s.glyphAt.x}
            y={s.glyphAt.y}
            textAnchor="middle"
            dominantBaseline="central"
            className="font-latin"
            fontSize={14}
            fill="#8C7F66"
          >
            {SIGN_GLYPH[s.sign] + VS}
          </text>
        ))}

        {/* 相位连线（行星 ↔ 行星，半径 R_PLANET） */}
        {aspects.map((a, i) => {
          const from = planetPos[a.from];
          const to = planetPos[a.to];
          if (!from || !to) return null;
          return (
            <line
              key={`aspect-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={ASPECT_COLOR[a.quality]}
              strokeWidth={1}
              opacity={0.55}
            />
          );
        })}

        {/* 行星符号 */}
        {planets.map((p) => {
          const pos = planetPos[p.name];
          if (!pos) return null;
          return (
            <g key={`planet-${p.name}`}>
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={14}
                fontWeight={600}
                fill="var(--color-ink)"
              >
                {(PLANET_GLYPH[p.name] ?? p.name) + VS}
              </text>
              {p.retrograde ? (
                <text
                  x={pos.x + 9}
                  y={pos.y + 7}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="font-latin"
                  fontSize={7}
                  fill="var(--color-ink-2)"
                >
                  {"℞"}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* Asc / MC 标记：短刻度 + 标签 */}
        {angularPoints.map((a) => (
          <g key={`ang-${a.label}`}>
            <line
              x1={a.onRing.x}
              y1={a.onRing.y}
              x2={a.tickOut.x}
              y2={a.tickOut.y}
              stroke="var(--color-cinnabar)"
              strokeWidth={1.5}
            />
            <text
              x={a.labelAt.x}
              y={a.labelAt.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="font-latin"
              fontSize={9}
              fill="var(--color-cinnabar)"
            >
              {a.label}
            </text>
          </g>
        ))}

        {/* 中心暗盘（留白，交由调用方覆盖内容） */}
        <circle cx={CX} cy={CY} r={R_CENTER} fill="var(--color-ink)" />
      </svg>

      {/* —— 行星速览列表 —— */}
      <ul className="flex w-full flex-col gap-1.5 md:max-w-[220px]">
        {planets.map((p) => (
          <li
            key={`row-${p.name}`}
            className="text-ink flex items-center gap-2 text-[13px]"
          >
            <span
              aria-hidden
              className="inline-flex w-5 justify-center"
              style={{ fontWeight: 600 }}
            >
              {(PLANET_GLYPH[p.name] ?? "") + VS}
            </span>
            <span className="w-9">{PLANET_CN[p.name] ?? p.name}</span>
            <span aria-hidden className="text-muted w-5 text-center">
              {(SIGN_GLYPH[p.sign] ?? "") + VS}
            </span>
            <span className="text-muted w-10 text-[12px]">{p.house}宫</span>
            <span className="font-latin text-muted tabular-nums text-[12px]">
              {p.degree.toFixed(1)}&deg;
            </span>
            {p.retrograde ? (
              <span className="font-latin" style={{ color: "var(--color-ink-2)" }}>
                {"℞"}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
