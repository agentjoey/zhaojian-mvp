"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 评分环（当代东方 v3）：SVG 双环 + requestAnimationFrame 计数 0→target（easeOutCubic）
 * + stroke-dashoffset 过渡。纸底细环，墨色进度。
 */
export function ScoreRing({
  score,
  max = 10,
  size = 104,
  label = "今日指数",
  track = "var(--color-line)",
  accent = "var(--color-ink)",
  textColor = "var(--color-ink)",
  subColor = "var(--color-muted)",
  showLabel = true,
}: {
  score: number;
  max?: number;
  size?: number;
  label?: string;
  track?: string;
  accent?: string;
  textColor?: string;
  subColor?: string;
  /** 小尺寸复用时（如挪作次要指标）关掉——两行文字挤在小圆里会重叠成一团。
   * `aria-label` 不受影响，视觉隐藏不等于信息丢失。 */
  showLabel?: boolean;
}) {
  const [n, setN] = useState(0);
  const raf = useRef(0);
  const pct = Math.max(0, Math.min(1, score / max));
  const CIRC = 314; // 2π·50

  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const target = Math.round(pct * max * 10) / 10;
    const dur = 1100;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      setN(Math.round(e * target * 10) / 10);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [pct, max]);

  return (
    <svg viewBox="0 0 120 120" style={{ width: size, height: size, flex: "none" }} aria-label={`${label} ${score}/${max}`}>
      <circle cx="60" cy="60" r="50" fill="none" stroke={track} strokeWidth="9" />
      <circle
        cx="60" cy="60" r="50" fill="none" stroke={accent} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={CIRC} strokeDashoffset={CIRC - CIRC * (n / max)}
        transform="rotate(-90 60 60)" style={{ transition: "stroke-dashoffset .1s linear" }}
      />
      <text
        x="60"
        y={showLabel ? 58 : 68}
        textAnchor="middle"
        fontFamily="var(--font-latin)"
        fontSize={showLabel ? 34 : 40}
        fontWeight="600"
        fill={textColor}
      >
        {Number.isInteger(n) ? n : n.toFixed(1)}
      </text>
      {showLabel && (
        <text x="60" y="78" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="11" fill={subColor}>{label}</text>
      )}
    </svg>
  );
}
