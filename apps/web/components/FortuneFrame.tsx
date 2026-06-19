/**
 * 框景/漏窗 —— 把运势配图裱进传统窗形（圆窗/八角窗/方圆窗），按日期轮换，
 * 借「框景」之意提升画面格调。纯 SVG，无依赖。
 */
type Shape = "circle" | "octagon" | "rounded";

function shapeOf(seed: string): Shape {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return (["circle", "octagon", "rounded"] as Shape[])[Math.abs(h) % 3]!;
}

const S = 320;
// 八角窗顶点（12 边距、88 切角）+ 内圈（向心收 ~7px，作双线窗框）
const OCT = "100,12 220,12 308,100 308,220 220,308 100,308 12,220 12,100";
const OCT_INNER = "102.6,18.4 217.4,18.4 301.6,102.6 301.6,217.4 217.4,301.6 102.6,301.6 18.4,217.4 18.4,102.6";

export function FortuneFrame({ src, alt, seed }: { src: string; alt: string; seed: string }) {
  const shape = shapeOf(seed);
  const clipId = `fclip-${shape}`;
  const ink = "var(--color-ink)";

  return (
    <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={alt} style={{ width: "100%", height: "auto", maxWidth: 360, display: "block", margin: "0 auto" }}>
      <defs>
        <clipPath id={clipId}>
          {shape === "circle" && <circle cx={160} cy={160} r={146} />}
          {shape === "octagon" && <polygon points={OCT} />}
          {shape === "rounded" && <rect x={14} y={14} width={292} height={292} rx={46} />}
        </clipPath>
      </defs>

      {/* 衬纸 */}
      <rect width={S} height={S} fill="var(--color-paper)" />
      {/* 裱入的画（cover） */}
      <image href={src} x={0} y={0} width={S} height={S} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />

      {/* 窗棂（仅八角窗，淡墨格栅，营造漏窗感） */}
      {shape === "octagon" && (
        <g clipPath={`url(#${clipId})`} stroke={ink} strokeOpacity={0.18} strokeWidth={1.4}>
          <line x1={107} y1={12} x2={107} y2={308} /><line x1={213} y1={12} x2={213} y2={308} />
          <line x1={12} y1={107} x2={308} y2={107} /><line x1={12} y1={213} x2={308} y2={213} />
        </g>
      )}

      {/* 窗框：外粗 + 内细双线 */}
      <g fill="none" stroke={ink}>
        {shape === "circle" && (<><circle cx={160} cy={160} r={146} strokeWidth={2.6} /><circle cx={160} cy={160} r={139} strokeWidth={1} strokeOpacity={0.5} /></>)}
        {shape === "octagon" && (<><polygon points={OCT} strokeWidth={2.6} strokeLinejoin="round" /><polygon points={OCT_INNER} strokeWidth={1} strokeOpacity={0.5} strokeLinejoin="round" /></>)}
        {shape === "rounded" && (<><rect x={14} y={14} width={292} height={292} rx={46} strokeWidth={2.6} /><rect x={20} y={20} width={280} height={280} rx={40} strokeWidth={1} strokeOpacity={0.5} /></>)}
      </g>
    </svg>
  );
}
