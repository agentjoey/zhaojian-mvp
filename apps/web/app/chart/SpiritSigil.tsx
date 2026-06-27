import type { ReactNode } from "react";

const TINTS: Record<string, string> = {
  wood: "#5B7A4B",
  fire: "#B23A2E",
  earth: "#9C7A3C",
  metal: "#6E7378",
  water: "#3C5A78",
};

export function SpiritSigil({ element, size = 48 }: { element: string; size?: number }) {
  const color = TINTS[element.toLowerCase()] ?? "currentColor";
  const s = size;
  const vb = s;

  const glyphs: Record<string, ReactNode> = {
    wood: (
      <g fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* trunk */}
        <path d={`M${s * 0.5},${s * 0.82} C${s * 0.5},${s * 0.62} ${s * 0.48},${s * 0.48} ${s * 0.5},${s * 0.18}`} />
        {/* branches */}
        <path d={`M${s * 0.5},${s * 0.42} Q${s * 0.34},${s * 0.32} ${s * 0.26},${s * 0.22}`} />
        <path d={`M${s * 0.5},${s * 0.52} Q${s * 0.66},${s * 0.40} ${s * 0.74},${s * 0.28}`} />
        {/* roots */}
        <path d={`M${s * 0.5},${s * 0.74} Q${s * 0.36},${s * 0.84} ${s * 0.30},${s * 0.88}`} />
        <path d={`M${s * 0.5},${s * 0.74} Q${s * 0.64},${s * 0.84} ${s * 0.70},${s * 0.88}`} />
      </g>
    ),
    fire: (
      <g fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* flame body */}
        <path d={`M${s * 0.5},${s * 0.84} C${s * 0.28},${s * 0.68} ${s * 0.30},${s * 0.42} ${s * 0.42},${s * 0.26} C${s * 0.44},${s * 0.38} ${s * 0.48},${s * 0.44} ${s * 0.50},${s * 0.52} C${s * 0.52},${s * 0.44} ${s * 0.56},${s * 0.38} ${s * 0.58},${s * 0.26} C${s * 0.70},${s * 0.42} ${s * 0.72},${s * 0.68} ${s * 0.50},${s * 0.84}`} />
        {/* inner flicker */}
        <path d={`M${s * 0.5},${s * 0.72} Q${s * 0.44},${s * 0.62} ${s * 0.48},${s * 0.52}`} strokeWidth="1.4" />
      </g>
    ),
    earth: (
      <g fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* horizon */}
        <line x1={s * 0.16} y1={s * 0.62} x2={s * 0.84} y2={s * 0.62} />
        {/* mound */}
        <path d={`M${s * 0.24},${s * 0.62} Q${s * 0.38},${s * 0.36} ${s * 0.50},${s * 0.30} Q${s * 0.62},${s * 0.36} ${s * 0.76},${s * 0.62}`} />
        {/* furrow */}
        <path d={`M${s * 0.50},${s * 0.30} L${s * 0.50},${s * 0.62}`} strokeWidth="1.4" />
      </g>
    ),
    metal: (
      <g fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* blade edge */}
        <path d={`M${s * 0.22},${s * 0.78} L${s * 0.50},${s * 0.18} L${s * 0.78},${s * 0.78}`} />
        {/* fuller */}
        <path d={`M${s * 0.38},${s * 0.58} L${s * 0.50},${s * 0.34} L${s * 0.62},${s * 0.58}`} strokeWidth="1.4" />
        {/* guard */}
        <line x1={s * 0.32} y1={s * 0.68} x2={s * 0.68} y2={s * 0.68} />
      </g>
    ),
    water: (
      <g fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* three flowing waves */}
        <path d={`M${s * 0.16},${s * 0.40} Q${s * 0.30},${s * 0.28} ${s * 0.44},${s * 0.40} T${s * 0.72},${s * 0.40} T${s * 0.88},${s * 0.32}`} />
        <path d={`M${s * 0.12},${s * 0.58} Q${s * 0.26},${s * 0.46} ${s * 0.40},${s * 0.58} T${s * 0.68},${s * 0.58} T${s * 0.92},${s * 0.50}`} />
        <path d={`M${s * 0.18},${s * 0.76} Q${s * 0.32},${s * 0.64} ${s * 0.46},${s * 0.76} T${s * 0.74},${s * 0.76} T${s * 0.90},${s * 0.68}`} />
      </g>
    ),
  };

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${vb} ${vb}`}
      aria-hidden
      className="inline-block shrink-0"
      style={{ color }}
    >
      {glyphs[element.toLowerCase()] ?? glyphs.water}
    </svg>
  );
}
