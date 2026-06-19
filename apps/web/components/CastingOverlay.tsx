import { GanzhiBadge } from "@/components/ui";

/**
 * 测算过场（素白 v2）：全屏深色 + 命盘加速旋转 + 铜铃摆动 + 干支落位 + 朱印回弹盖下。
 * 品牌化 loading；纯 CSS 动效（keyframes 见 globals.css）。
 */
export function CastingOverlay({
  gan = "庚",
  zhi = "申",
  seal = "今",
  title = "正在推算当日流日",
}: {
  gan?: string;
  zhi?: string;
  seal?: string;
  title?: string;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden zj-fade" style={{ background: "#15171C" }}>
      {/* 加速旋转盘 */}
      <svg viewBox="0 0 320 320" className="absolute w-[340px]" style={{ opacity: 0.3 }} aria-hidden>
        <g style={{ transformOrigin: "160px 160px", animation: "zjSpinFast 2.4s var(--ease-cast) infinite" }}>
          <circle cx="160" cy="160" r="150" fill="none" stroke="#C9A24B" strokeWidth="1.2" />
          <circle cx="160" cy="160" r="110" fill="none" stroke="#C9A24B" strokeWidth="1" />
          <g stroke="#C9A24B" strokeWidth=".8">
            {Array.from({ length: 8 }, (_, i) => (
              <line key={i} x1="160" y1="10" x2="160" y2="46" style={{ transform: `rotate(${i * 45}deg)`, transformOrigin: "160px 160px" }} />
            ))}
          </g>
        </g>
      </svg>
      <span className="zj-pulse absolute h-[3px] w-[3px] rounded-full" style={{ top: "26%", left: "20%", background: "#C9A24B" }} />
      <span className="zj-pulse absolute h-[2.5px] w-[2.5px] rounded-full" style={{ top: "32%", right: "16%", background: "#E0694F", animationDelay: ".4s" }} />

      {/* 摆动铜铃 */}
      <svg viewBox="0 0 80 92" className="relative" style={{ width: 84, height: "auto" }} aria-hidden>
        <g style={{ transformOrigin: "40px 18px", animation: "zjBell 1.15s ease-in-out infinite" }}>
          <line x1="40" y1="6" x2="40" y2="20" stroke="#C9A24B" strokeWidth="1.6" />
          <path d="M40,22 C32,22 27,30 27,42 C27,48 29,53 32,58 C35,55 38,53 40,53 C42,53 45,55 48,58 C51,53 53,48 53,42 C53,30 48,22 40,22 Z" fill="#E0694F" />
          <circle cx="40" cy="61" r="2.4" fill="#C9A24B" />
          <path d="M40,64 L44,70 L40,77 L36,70 Z" fill="#C9A24B" />
        </g>
      </svg>

      <div className="relative mt-7 font-serif text-[20px] font-semibold" style={{ color: "#F3EFE4" }}>{title}</div>

      <div className="relative mt-5 flex gap-3">
        <span style={{ animation: "zjGZ .5s var(--ease-rise) .3s both" }}><GanzhiBadge char={gan} size={48} /></span>
        <span style={{ animation: "zjGZ .5s var(--ease-rise) .6s both" }}><GanzhiBadge char={zhi} size={48} /></span>
      </div>

      {/* 落印 */}
      <div
        className="mt-7 flex items-center justify-center font-serif font-bold"
        style={{ width: 62, height: 62, borderRadius: "var(--radius-icon)", background: "var(--color-cinnabar)", color: "var(--color-on-ink)", fontSize: 30, boxShadow: "inset 0 0 0 1.6px rgba(243,241,234,.45)", animation: "zjStamp .6s var(--ease-pop) 1.1s both" }}
      >
        {seal}
      </div>
      <div className="latin-label mt-6 text-[11px]" style={{ color: "#827A68", animation: "zjFade .6s ease 1.3s both" }}>Casting today’s reading</div>
    </div>
  );
}
