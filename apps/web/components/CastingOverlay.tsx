import { BellLogo, GanzhiBadge } from "@/components/ui";

/**
 * 测算过场（当代东方 v3）：纸底仪式——命盘环徐转 + 风铃轻摆 + 干支落位 + 朱印盖下。
 * 品牌化 loading；纯 CSS 动效（keyframes 见 globals.css）。深色金盘版已随 v3 废除。
 */
export function CastingOverlay({
  gan = "庚",
  zhi = "申",
  seal = "今",
  title = "正在推算当日流日",
  hint,
}: {
  gan?: string;
  zhi?: string;
  seal?: string;
  title?: string;
  /** 底部小字提示；提供才渲染（文案由调用方按 locale 注入）。 */
  hint?: string;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden zj-fade" style={{ background: "var(--color-paper)" }}>
      {/* 徐转命盘环 */}
      <svg viewBox="0 0 320 320" className="absolute w-[340px]" style={{ opacity: 0.55 }} aria-hidden>
        <g style={{ transformOrigin: "160px 160px", animation: "zjSpinFast 6s linear infinite" }}>
          <circle cx="160" cy="160" r="150" fill="none" stroke="var(--color-spoke)" strokeWidth="1.2" />
          <circle cx="160" cy="160" r="110" fill="none" stroke="var(--color-spoke)" strokeWidth="1" />
          <g stroke="var(--color-spoke)" strokeWidth=".8">
            {Array.from({ length: 8 }, (_, i) => (
              <line key={i} x1="160" y1="10" x2="160" y2="46" style={{ transform: `rotate(${i * 45}deg)`, transformOrigin: "160px 160px" }} />
            ))}
          </g>
        </g>
      </svg>

      {/* 风铃（品牌原件，自带轻摆） */}
      <span className="relative"><BellLogo size={72} /></span>

      <div className="relative mt-7 font-serif text-[20px] font-semibold" style={{ color: "var(--color-ink)" }}>{title}</div>

      <div className="relative mt-5 flex gap-3">
        <span style={{ animation: "zjGZ .5s var(--ease-rise) .3s both" }}><GanzhiBadge char={gan} size={48} /></span>
        <span style={{ animation: "zjGZ .5s var(--ease-rise) .6s both" }}><GanzhiBadge char={zhi} size={48} /></span>
      </div>

      {/* 落印 */}
      <div
        className="mt-7 flex items-center justify-center font-serif font-bold"
        style={{ width: 62, height: 62, borderRadius: "var(--radius-seal)", background: "var(--color-cinnabar)", color: "var(--color-paper)", fontSize: 30, animation: "zjStamp .6s var(--ease-pop) 1.1s both" }}
      >
        {seal}
      </div>
      {hint && (
        <div className="mt-6 text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)", animation: "zjFade .6s ease 1.3s both" }}>{hint}</div>
      )}
    </div>
  );
}
