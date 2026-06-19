import type { ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// —— 五行映射（天干/地支 → 木火土金水）——
const STEM: Record<string, Element> = { 甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth", 己: "earth", 庚: "metal", 辛: "metal", 壬: "water", 癸: "water" };
const BRANCH: Record<string, Element> = { 子: "water", 丑: "earth", 寅: "wood", 卯: "wood", 辰: "earth", 巳: "fire", 午: "fire", 未: "earth", 申: "metal", 酉: "metal", 戌: "earth", 亥: "water" };
export type Element = "wood" | "fire" | "earth" | "metal" | "water";
export const ELEMENT_LABEL: Record<Element, string> = { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" };
export const WUXING_LABEL_TO_KEY: Record<string, Element> = { 木: "wood", 火: "fire", 土: "earth", 金: "metal", 水: "water" };
export function elementOf(ganzhi: string): Element | null {
  return STEM[ganzhi] ?? BRANCH[ganzhi] ?? null;
}

// —— 印章图标（朱红方章，单字成标）——
export function SealIcon({
  char,
  variant = "bai",
  size = 40,
  className,
}: {
  char: string;
  variant?: "bai" | "zhu"; // 白文=朱底镂字 / 朱文=纸底朱字
  size?: number;
  className?: string;
}) {
  const isBai = variant === "bai";
  return (
    <span
      className={cn("inline-flex items-center justify-center font-bold select-none", className)}
      style={{
        width: size,
        height: size,
        borderRadius: "var(--radius-seal)",
        fontFamily: "var(--font-serif)",
        fontSize: size * 0.5,
        lineHeight: 1,
        background: isBai ? "var(--color-seal)" : "var(--color-paper)",
        color: isBai ? "var(--color-paper)" : "var(--color-seal)",
        boxShadow: isBai
          ? "inset 0 0 0 1.5px rgba(243,241,234,.4)"
          : "inset 0 0 0 2px var(--color-seal)",
      }}
      aria-hidden
    >
      {char}
    </span>
  );
}

// —— 按钮 ——
export function Button({
  variant = "primary",
  className,
  children,
  ...rest
}: {
  variant?: "primary" | "secondary" | "text";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = "inline-flex items-center justify-center gap-2 text-[15px] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "px-6 py-3 text-[var(--color-on-ink)] bg-[var(--color-cinnabar)] hover:bg-[var(--color-cinnabar-press)]"
      : variant === "secondary"
        ? "px-6 py-3 text-[var(--color-ink)] bg-transparent border border-[var(--color-line)] hover:border-[var(--color-cinnabar)]"
        : "text-[var(--color-gold)] underline underline-offset-[5px] hover:text-[var(--color-cinnabar)]";
  return (
    <button
      className={cn(base, styles, className)}
      style={variant !== "text" ? { borderRadius: "var(--radius-button)" } : undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

// —— 信息卡（可选顶边强调色：fire/water/metal/none，对应命理/心理/共振）——
export function Card({
  topAccent,
  dark = false,
  className,
  children,
}: {
  topAccent?: Element | "cinnabar";
  dark?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const accentVar = topAccent ? (topAccent === "cinnabar" ? "var(--color-cinnabar)" : `var(--color-${topAccent})`) : undefined;
  return (
    <div
      className={cn("p-5", className)}
      style={{
        borderRadius: "var(--radius-card)",
        background: dark ? "var(--color-ink)" : "var(--color-surface)",
        color: dark ? "var(--color-on-ink)" : "var(--color-ink)",
        border: dark ? "none" : "1px solid var(--color-line)",
        borderTop: accentVar ? `3px solid ${accentVar}` : undefined,
      }}
    >
      {children}
    </div>
  );
}

// —— 标签（四化实心 / 宜忌描边）——
const MUTAGEN_ELEMENT: Record<string, Element> = { 禄: "wood", 权: "earth", 科: "water", 忌: "fire" };
export function MutagenTag({ kind }: { kind: "禄" | "权" | "科" | "忌" }) {
  const el = MUTAGEN_ELEMENT[kind]!;
  return (
    <span
      className="inline-flex h-[18px] min-w-[18px] items-center justify-center px-1 text-[11px] font-semibold"
      style={{ borderRadius: "var(--radius-chip)", background: `var(--color-${el})`, color: `var(--color-on-${el})` }}
    >
      {kind}
    </span>
  );
}

export function Tag({
  children,
  tone = "line",
}: {
  children: ReactNode;
  tone?: "line" | "ink" | "gold";
}) {
  const style =
    tone === "ink"
      ? { background: "var(--color-tint)", color: "var(--color-ink-2)" }
      : tone === "gold"
        ? { background: "transparent", color: "var(--color-gold)", border: "1px solid var(--color-gold)" }
        : { background: "transparent", color: "var(--color-ink-2)", border: "1px solid var(--color-line)" };
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-[12px]" style={{ borderRadius: "var(--radius-chip)", ...style }}>
      {children}
    </span>
  );
}

// —— 天干地支圆徽 ——
export function GanzhiBadge({
  char,
  highlight = false,
  size = 44,
}: {
  char: string;
  highlight?: boolean; // 日主双描边
  size?: number;
}) {
  const el = elementOf(char);
  const bg = el ? `var(--color-${el})` : "var(--color-tint)";
  const fg = el ? `var(--color-on-${el})` : "var(--color-ink)";
  return (
    <span
      className="inline-flex items-center justify-center font-semibold"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: fg,
        fontFamily: "var(--font-serif)",
        fontSize: size * 0.46,
        boxShadow: highlight ? "0 0 0 2px var(--color-surface), 0 0 0 3px var(--color-fire)" : undefined,
      }}
    >
      {char}
    </span>
  );
}
