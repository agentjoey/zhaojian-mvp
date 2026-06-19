import type { WesternChart, Aspect } from "@eamvp/core";

// ── 静态查表（纯展示，无任何排盘推算）─────────────────────────────
const SIGN_ORDER = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"] as const;
const SIGN_INDEX: Record<string, number> = SIGN_ORDER.reduce((a, n, i) => ((a[n] = i), a), {} as Record<string, number>);

const VS = "︎"; // 变体选择符：强制文本字形（避免彩色 emoji）
const SIGN_GLYPH: Record<string, string> = { Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍", Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓" };
const PLANET_GLYPH: Record<string, string> = { Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂", Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇" };
const PLANET_CN: Record<string, string> = { Sun: "太阳", Moon: "月亮", Mercury: "水星", Venus: "金星", Mars: "火星", Jupiter: "木星", Saturn: "土星", Uranus: "天王", Neptune: "海王", Pluto: "冥王" };
const SIGN_CN: Record<string, string> = { Aries: "白羊", Taurus: "金牛", Gemini: "双子", Cancer: "巨蟹", Leo: "狮子", Virgo: "处女", Libra: "天秤", Scorpio: "天蝎", Sagittarius: "射手", Capricorn: "摩羯", Aquarius: "水瓶", Pisces: "双鱼" };

// ── 几何 ──────────────────────────────────────────────
const SIZE = 440;
const C = SIZE / 2;
const R_OUTER = 212;
const R_ZODIAC_IN = 172; // 黄道带内缘
const R_SIGN = 192; // 星座符号
const R_HOUSENUM = 158; // 宫号
const R_TICK = 172; // 真实度数刻度（落在黄道内缘）
const R_GLYPH = 134; // 行星符号（经防撞展开）
const R_ASPECT = 112; // 相位连线（用真实角，连成图案）

const ASPECT_COLOR: Record<Aspect["quality"], string> = { hard: "var(--color-fire)", soft: "var(--color-water)", neutral: "var(--color-spoke)" };

function polar(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C - r * Math.sin(rad) };
}
const lonOf = (sign: string, degree: number) => (SIGN_INDEX[sign] ?? 0) * 30 + degree;
// 升序经度逆时针，上升点固定在左侧（屏幕 180°）
const screenDeg = (lon: number, ascLon: number) => 180 + (lon - ascLon);

/** 行星防撞：同/近经度的符号在角度上展开，最小间隔 MIN，仍以刻度线连回真实位置。 */
function spread(angles: number[], MIN = 11): number[] {
  const idx = angles.map((a, i) => i).sort((i, j) => angles[i]! - angles[j]!);
  const out = angles.slice();
  // 前向：保证相邻 ≥ MIN
  for (let k = 1; k < idx.length; k++) {
    const a = idx[k]!, b = idx[k - 1]!;
    if (out[a]! - out[b]! < MIN) out[a] = out[b]! + MIN;
  }
  // 回拉：整簇居中（避免单向漂移）
  const last = idx[idx.length - 1]!, first = idx[0]!;
  const drift = out[last]! - angles[last]!;
  if (drift > 0) for (const i of idx) out[i] = out[i]! - drift / 2;
  void first;
  return out;
}

export function NatalWheel({ western }: { western: WesternChart | null }) {
  if (!western) return null;
  const { ascendant, midheaven, planets, aspects } = western;
  const ascLon = lonOf(ascendant.sign, ascendant.degree);

  // 真实角（连刻度/相位用）
  const trueAngle: Record<string, number> = {};
  const trueLon: Record<string, number> = {};
  for (const p of planets) {
    trueLon[p.name] = lonOf(p.sign, p.degree);
    trueAngle[p.name] = screenDeg(trueLon[p.name]!, ascLon);
  }
  // 展开角（放符号用）
  const dispArr = spread(planets.map((p) => trueAngle[p.name]!));
  const dispAngle: Record<string, number> = {};
  planets.forEach((p, i) => (dispAngle[p.name] = dispArr[i]!));

  const mcLon = lonOf(midheaven.sign, midheaven.degree);

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="西方本命盘" style={{ width: "100%", height: "auto", maxWidth: 440 }}>
        {/* 圆环 */}
        <circle cx={C} cy={C} r={R_OUTER} fill="none" stroke="var(--color-line)" strokeWidth={1} />
        <circle cx={C} cy={C} r={R_ZODIAC_IN} fill="none" stroke="var(--color-line)" strokeWidth={1} />
        <circle cx={C} cy={C} r={R_HOUSENUM - 14} fill="none" stroke="var(--color-spoke)" strokeWidth={1} />
        <circle cx={C} cy={C} r={R_ASPECT} fill="var(--color-surface)" stroke="var(--color-spoke)" strokeWidth={1} />

        {/* 星座分段 + 符号 */}
        {SIGN_ORDER.map((sign, i) => {
          const a0 = screenDeg(i * 30, ascLon);
          const aMid = screenDeg(i * 30 + 15, ascLon);
          const o = polar(R_OUTER, a0), inn = polar(R_ZODIAC_IN, a0), g = polar(R_SIGN, aMid);
          return (
            <g key={sign}>
              <line x1={o.x} y1={o.y} x2={inn.x} y2={inn.y} stroke="var(--color-line)" strokeWidth={1} />
              <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" fontSize={17} fill="#8C7F66">{SIGN_GLYPH[sign] + VS}</text>
            </g>
          );
        })}

        {/* 宫辐条 + 宫号（整宫制：上升起，逆时针 1→12） */}
        {Array.from({ length: 12 }, (_, h) => {
          const a = screenDeg(ascLon + h * 30, ascLon);
          const out = polar(R_ZODIAC_IN, a), inn = polar(R_ASPECT, a);
          const numAt = polar(R_HOUSENUM, screenDeg(ascLon + h * 30 + 15, ascLon));
          return (
            <g key={`h${h}`}>
              <line x1={out.x} y1={out.y} x2={inn.x} y2={inn.y} stroke="var(--color-spoke)" strokeWidth={h % 3 === 0 ? 1.4 : 0.8} />
              <text x={numAt.x} y={numAt.y} textAnchor="middle" dominantBaseline="central" className="font-latin" fontSize={11} fill="var(--color-muted)">{h + 1}</text>
            </g>
          );
        })}

        {/* 相位连线（真实角，半径 R_ASPECT 内） */}
        {aspects.map((a, i) => {
          const f = trueAngle[a.from], t = trueAngle[a.to];
          if (f == null || t == null) return null;
          const p1 = polar(R_ASPECT, f), p2 = polar(R_ASPECT, t);
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={ASPECT_COLOR[a.quality]} strokeWidth={1} opacity={0.5} />;
        })}

        {/* 行星：真实刻度线 + 展开符号 */}
        {planets.map((p) => {
          const tickOuter = polar(R_ZODIAC_IN, trueAngle[p.name]!);
          const tickInner = polar(R_GLYPH + 11, dispAngle[p.name]!);
          const g = polar(R_GLYPH, dispAngle[p.name]!);
          return (
            <g key={p.name}>
              <line x1={tickOuter.x} y1={tickOuter.y} x2={tickInner.x} y2={tickInner.y} stroke="var(--color-spoke)" strokeWidth={0.8} />
              <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" fontSize={18} fontWeight={600} fill="var(--color-ink)">{(PLANET_GLYPH[p.name] ?? p.name) + VS}</text>
              {p.retrograde && <text x={g.x + 11} y={g.y + 8} textAnchor="middle" dominantBaseline="central" className="font-latin" fontSize={9} fill="var(--color-fire)">℞</text>}
            </g>
          );
        })}

        {/* Asc / MC：粗刻度 + 标签 */}
        {[{ l: "ASC", lon: ascLon }, { l: "MC", lon: mcLon }].map((a) => {
          const on = polar(R_ZODIAC_IN, screenDeg(a.lon, ascLon));
          const out = polar(R_OUTER + 1, screenDeg(a.lon, ascLon));
          const lab = polar(R_OUTER + 12, screenDeg(a.lon, ascLon));
          return (
            <g key={a.l}>
              <line x1={on.x} y1={on.y} x2={out.x} y2={out.y} stroke="var(--color-cinnabar)" strokeWidth={2} />
              <text x={lab.x} y={lab.y} textAnchor="middle" dominantBaseline="central" className="latin-label" fontSize={9} fill="var(--color-cinnabar)">{a.l}</text>
            </g>
          );
        })}
      </svg>

      {/* 行星速览 */}
      <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5 lg:max-w-[230px] lg:grid-cols-1">
        {planets.map((p) => (
          <li key={p.name} className="flex items-center gap-2 text-[13px] text-ink">
            <span aria-hidden className="inline-flex w-5 justify-center font-semibold">{(PLANET_GLYPH[p.name] ?? "") + VS}</span>
            <span className="w-9">{PLANET_CN[p.name] ?? p.name}</span>
            <span className="w-9 text-muted">{SIGN_CN[p.sign] ?? p.sign}</span>
            <span className="w-8 text-muted text-[12px]">{p.house}宫</span>
            <span className="font-latin tabular-nums text-muted text-[12px]">{p.degree.toFixed(1)}°</span>
            {p.retrograde && <span className="font-latin text-fire text-[12px]">℞</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
