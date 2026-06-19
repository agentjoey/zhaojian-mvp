import Link from "next/link";
import { SealIcon, Card } from "@/components/ui";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center px-6 py-16 text-center sm:py-24">
      {/* 品牌 */}
      <div className="flex items-center gap-3">
        <SealIcon char="照" size={44} />
        <div className="text-left leading-none">
          <div className="text-2xl font-semibold tracking-wide">照见</div>
          <div className="latin-label mt-1 text-[10px] text-muted">ZHAOJIAN</div>
        </div>
      </div>

      {/* 主标题 */}
      <h1 className="mt-14 font-semibold leading-tight" style={{ fontSize: "clamp(40px, 8vw, 80px)" }}>
        照见
        <span className="text-cinnabar">本来</span>
        面目
      </h1>
      <p className="mt-6 max-w-xl text-[16px] leading-[1.95] text-ink-2">
        以紫微斗数与八字为<strong className="text-cinnabar">结构</strong>，
        借利兹·格林深层心理为<strong className="text-cinnabar">意义</strong>。
        东西双盘互证，是一面自我观照的镜子——
        <span className="text-muted">不预言吉凶，只照见回声。</span>
      </p>

      <div className="mt-9">
        <Link
          href="/reading"
          className="inline-flex items-center justify-center px-8 py-3.5 text-[15px] text-on-ink transition-all duration-200 hover:bg-cinnabar-press"
          style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}
        >
          为我起盘
        </Link>
      </div>

      {/* 三段式 */}
      <section className="mt-16 grid w-full gap-4 text-left sm:grid-cols-3">
        {[
          { el: "fire" as const, t: "命理 · 结构", d: "紫微十二宫、八字四柱、生年四化——由开源排盘引擎精确计算，可审计、不臆造。" },
          { el: "water" as const, t: "心理 · 映照", d: "太阳月亮上升、土星课题、内在张力——以荣格原型的视角，读命盘为心象。" },
          { el: "metal" as const, t: "共振 · 建议", d: "仅在内在世界轴等高置信处，东西互证，给出克制、非决定论的成长之言。" },
        ].map((c) => (
          <Card key={c.t} topAccent={c.el}>
            <h2 className="text-[17px] font-semibold">{c.t}</h2>
            <p className="mt-2 text-[14px] leading-[1.85] text-ink-2">{c.d}</p>
          </Card>
        ))}
      </section>

      <p className="mt-14 max-w-xl text-[12px] leading-relaxed text-muted">
        本产品仅作传统文化与心理学的自我探索工具，所有解读仅供自我反思，不构成医疗、法律、财务或心理诊断建议。
      </p>
    </main>
  );
}
