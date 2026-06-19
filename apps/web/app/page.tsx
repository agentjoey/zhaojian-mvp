import Link from "next/link";
import { BellLogo, HeroWheel } from "@/components/ui";

const ENTRIES = [
  { href: "/calendar", char: "运", n: "01", title: "今日运势", sub: "流日 · 每日一推", bg: "var(--color-cinnabar)", fg: "#fff", arrow: "var(--color-cinnabar)" },
  { href: "/chart", char: "序", n: "02", title: "本年时序", sub: "流年 · 大限四化", bg: "var(--color-ink)", fg: "var(--color-on-ink)", arrow: "var(--color-ink)" },
  { href: "/chart", char: "盘", n: "03", title: "我的命盘", sub: "命理 + 心理解读", bg: "var(--color-water)", fg: "var(--color-on-water)", arrow: "var(--color-water)" },
  { href: "/reading", char: "起", n: "04", title: "起盘建档", sub: "出生信息即时排盘", bg: "var(--color-metal)", fg: "var(--color-on-metal)", arrow: "var(--color-metal)" },
] as const;

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[480px] pb-16">
      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden px-7 pb-2 pt-14" style={{ background: "linear-gradient(180deg,#F2F0EA 0%,#F6F5F1 70%)" }}>
        <HeroWheel className="pointer-events-none absolute left-1/2 top-8 -ml-[230px] w-[460px]" style={{ opacity: 0.12 }} />
        <span className="zj-pulse absolute left-12 top-24 h-[3px] w-[3px] rounded-full" style={{ background: "var(--color-cinnabar)" }} />
        <span className="zj-pulse absolute right-12 top-36 h-[2.5px] w-[2.5px] rounded-full" style={{ background: "var(--color-gold)", animationDelay: ".6s" }} />
        <span className="zj-pulse absolute left-10 top-56 h-[2px] w-[2px] rounded-full" style={{ background: "var(--color-water)", animationDelay: "1.1s" }} />

        <div className="zj-rise relative flex items-center gap-2.5">
          <BellLogo size={26} />
          <span className="font-serif text-[17px] font-bold tracking-[0.14em]">照见</span>
        </div>

        <div className="relative mt-28">
          <div className="zj-rise latin-label text-[12px] text-cinnabar" style={{ animationDelay: ".08s" }}>Mirror, not fate</div>
          <h1 className="zj-rise mt-2.5 font-serif text-[46px] font-black leading-[1.08]" style={{ animationDelay: ".16s" }}>
            你的命盘，<br />是一面镜子
          </h1>
          <p className="zj-rise mt-3.5 max-w-[290px] text-[13.5px] leading-[1.8] text-ink-2" style={{ animationDelay: ".26s" }}>
            紫微 · 八字 × 深层心理。观照自身，而非预言吉凶。
          </p>
        </div>
      </section>

      {/* ===== 下沉内容 ===== */}
      <div className="relative -mt-3 px-5">
        <Link
          href="/reading"
          className="zj-rise zj-btn flex w-full items-center justify-center py-[17px] text-[16px] font-medium text-white transition-transform duration-200 hover:-translate-y-0.5"
          style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)", boxShadow: "var(--shadow-btn)", animationDelay: ".34s" }}
        >
          为我起盘 · 即时生成
        </Link>

        {/* 高频入口网格 */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          {ENTRIES.map((e, i) => (
            <Link
              key={e.title}
              href={e.href}
              className="zj-rise group block bg-surface p-[18px] transition-transform duration-200 hover:-translate-y-0.5"
              style={{ borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", animationDelay: `${0.42 + i * 0.06}s` }}
            >
              <div className="flex items-start justify-between">
                <span className="inline-flex h-10 w-10 items-center justify-center font-serif text-[21px] font-bold" style={{ borderRadius: "var(--radius-icon)", background: e.bg, color: e.fg, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.24)" }}>
                  {e.char}
                </span>
                <span className="font-latin text-[14px]" style={{ color: "#C9C2B2" }}>{e.n}</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[15px] font-medium">{e.title}</span>
                <span className="text-[15px]" style={{ color: e.arrow }}>→</span>
              </div>
              <div className="mt-1 text-[12px] text-muted">{e.sub}</div>
            </Link>
          ))}
        </div>

        {/* 三段式说明 */}
        <div className="mt-4 grid gap-3">
          {[
            { el: "var(--color-fire)", k: "East · 命理结构", t: "紫微十二宫、八字四柱、生年四化——开源引擎精确计算，可审计、不臆造。" },
            { el: "var(--color-water)", k: "West · 心理映照", t: "太阳月亮上升、土星课题、内在张力——以荣格原型读命盘为心象。" },
            { el: "var(--color-metal)", k: "Resonance · 共振", t: "仅在内在世界轴等高置信处东西互证，给出克制、非决定论的成长之言。" },
          ].map((c) => (
            <div key={c.k} className="bg-surface p-5" style={{ borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", borderTop: `3px solid ${c.el}` }}>
              <div className="latin-label mb-2 text-[11px] text-muted">{c.k}</div>
              <p className="text-[14px] leading-[1.85] text-ink-2">{c.t}</p>
            </div>
          ))}
        </div>

        <p className="mt-9 px-1 text-[12px] leading-relaxed text-muted">
          本产品为传统文化与心理学的自我探索工具，所有解读仅供自我反思，不构成医疗、法律、财务或心理诊断建议。
        </p>
      </div>
    </main>
  );
}
