"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BellLogo, HeroWheel } from "@/components/ui";
import { isTelegram } from "@/lib/tg/client";
import { Group, Cell } from "@/components/tg/native";
import { useT } from "@/lib/i18n/I18nProvider";

const ENTRIES = [
  { href: "/calendar", char: "运", n: "01", key: "calendar" as const, bg: "var(--color-cinnabar)", fg: "#fff", arrow: "var(--color-cinnabar)" },
  { href: "/chart", char: "序", n: "02", key: "annual" as const, bg: "var(--color-ink)", fg: "var(--color-on-ink)", arrow: "var(--color-ink)" },
  { href: "/chart", char: "盘", n: "03", key: "chart" as const, bg: "var(--color-water)", fg: "var(--color-on-water)", arrow: "var(--color-water)" },
  { href: "/reading", char: "起", n: "04", key: "reading" as const, bg: "var(--color-metal)", fg: "var(--color-on-metal)", arrow: "var(--color-metal)" },
] as const;

const CARDS = [
  { id: "east" as const, el: "var(--color-fire)" },
  { id: "west" as const, el: "var(--color-water)" },
  { id: "resonance" as const, el: "var(--color-metal)" },
] as const;

const TG_ENTRIES = [
  { icon: "运", accent: "var(--color-cinnabar)", key: "calendar" as const, path: "/calendar" },
  { icon: "盘", accent: "var(--color-water)", key: "chart" as const, path: "/chart" },
  { icon: "灵", accent: "var(--color-metal)", key: "spirit" as const, path: "/spirit" },
  { icon: "起", accent: "var(--color-earth)", key: "reading" as const, path: "/reading" },
  { icon: "档", accent: "var(--color-wood)", key: "profiles" as const, path: "/profiles" },
] as const;

export default function Home() {
  const [heroSrc, setHeroSrc] = useState("/hero/hero-bg.jpeg");
  const [mounted, setMounted] = useState(false);
  const inTg = mounted && isTelegram();
  const router = useRouter();
  const t = useT();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const el = document.documentElement;
    const read = () => {
      const isDark = el.getAttribute("data-tg-theme") === "dark";
      setHeroSrc(isDark ? "/hero/hero-bg-dark.jpeg" : "/hero/hero-bg.jpeg");
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["data-tg-theme"] });
    return () => mo.disconnect();
  }, []);

  return (
    <main className="mx-auto w-full max-w-[480px] pb-16 lg:max-w-5xl">
      {!inTg && (
        <>
          {/* ===== Hero ===== */}
          <section className="relative overflow-hidden px-7 pb-2 pt-14 lg:pb-10 lg:pt-24 lg:text-center" style={{ background: "linear-gradient(180deg,#F2F0EA 0%,#F6F5F1 70%)" }}>
            {/* 氛围大图 + 米白渐隐遮罩（让宋体标题仍是主角） */}
            <img src={heroSrc} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ opacity: 0.55 }} onError={() => { if (heroSrc === "/hero/hero-bg-dark.jpeg") setHeroSrc("/hero/hero-bg.jpeg"); }} />
            <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--color-paper) 25%, transparent) 0%, color-mix(in srgb, var(--color-paper) 60%, transparent) 42%, var(--color-paper) 88%)" }} />
            <HeroWheel className="pointer-events-none absolute left-1/2 top-8 -ml-[230px] w-[460px]" style={{ opacity: 0.1 }} />
            <span className="zj-pulse absolute left-12 top-24 h-[3px] w-[3px] rounded-full" style={{ background: "var(--color-cinnabar)" }} />
            <span className="zj-pulse absolute right-12 top-36 h-[2.5px] w-[2.5px] rounded-full" style={{ background: "var(--color-gold)", animationDelay: ".6s" }} />
            <span className="zj-pulse absolute left-10 top-56 h-[2px] w-[2px] rounded-full" style={{ background: "var(--color-water)", animationDelay: "1.1s" }} />

            <div className="zj-rise relative flex items-center gap-2.5 lg:justify-center">
              <BellLogo size={26} />
              <span className="font-serif text-[17px] font-bold tracking-[0.14em]">{t("common.brand")}</span>
            </div>

            <div className="relative mt-28 lg:mt-16">
              <div className="zj-rise latin-label text-[12px] text-cinnabar" style={{ animationDelay: ".08s" }}>Mirror, not fate</div>
              <h1 className="zj-rise mt-2.5 font-serif text-[46px] font-black leading-[1.08] lg:text-[68px]" style={{ animationDelay: ".16s" }}>
                {t("home.heroTitle1")}<br className="lg:hidden" />{t("home.heroTitle2")}
              </h1>
              <p className="zj-rise mt-3.5 max-w-[290px] text-[13.5px] leading-[1.8] text-ink-2 lg:mx-auto lg:max-w-[420px] lg:text-[15px]" style={{ animationDelay: ".26s" }}>
                {t("home.heroSubtitle")}
              </p>
            </div>
          </section>

          {/* ===== 下沉内容 ===== */}
          <div className="relative -mt-3 px-5 lg:mx-auto lg:mt-2 lg:max-w-4xl lg:px-0">
            <Link
              href="/reading"
              className="zj-rise zj-btn mx-auto flex w-full items-center justify-center py-[17px] text-[16px] font-medium text-white transition-transform duration-200 hover:-translate-y-0.5 lg:max-w-md"
              style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)", boxShadow: "var(--shadow-btn)", animationDelay: ".34s" }}
            >
              {t("home.ctaButton")}
            </Link>

            {/* 高频入口网格 */}
            <div className="mt-3 grid grid-cols-2 gap-3 lg:mt-6 lg:grid-cols-4">
              {ENTRIES.map((e, i) => (
                <Link
                  key={e.key}
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
                    <span className="text-[15px] font-medium">{t(`home.entries.${e.key}.title`)}</span>
                    <span className="text-[15px]" style={{ color: e.arrow }}>→</span>
                  </div>
                  <div className="mt-1 text-[12px] text-muted">{t(`home.entries.${e.key}.sub`)}</div>
                </Link>
              ))}
            </div>

            {/* 三段式说明 */}
            <div className="mt-4 grid gap-3 lg:mt-6 lg:grid-cols-3">
              {CARDS.map((c) => (
                <div key={c.id} className="bg-surface p-5" style={{ borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", borderTop: `3px solid ${c.el}` }}>
                  <div className="latin-label mb-2 text-[11px] text-muted">{t(`home.cards.${c.id}.label`)}</div>
                  <p className="text-[14px] leading-[1.85] text-ink-2">{t(`home.cards.${c.id}.text`)}</p>
                </div>
              ))}
            </div>

            <p className="mt-9 px-1 text-[12px] leading-relaxed text-muted">
              {t("home.disclaimer")}
            </p>
          </div>
        </>
      )}

      {inTg && (
        <div className="px-5 pt-10">
          <div className="mb-5">
            <h1 className="font-serif text-[24px] font-bold tracking-[0.08em]">{t("common.brand")}</h1>
            <p className="mt-1 text-[13px] text-muted">{t("home.tg.tagline")}</p>
          </div>
          <Group>
            {TG_ENTRIES.map((e) => (
              <Cell
                key={e.key}
                icon={e.icon}
                accent={e.accent}
                title={t(`home.tg.entries.${e.key}.title`)}
                subtitle={t(`home.tg.entries.${e.key}.subtitle`)}
                onClick={() => router.push(e.path)}
              />
            ))}
          </Group>
        </div>
      )}
    </main>
  );
}
