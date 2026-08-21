"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellLogo, HeroWheel } from "@/components/ui";
import { useIsTelegram } from "@/lib/tg/ui";
import { Group, Cell } from "@/components/tg/native";
import { useT } from "@/lib/i18n/I18nProvider";

const ENTRIES = [
  { href: "/calendar", key: "calendar" as const },
  { href: "/chart", key: "annual" as const },
  { href: "/chart", key: "chart" as const },
  { href: "/reading", key: "reading" as const },
  ...(process.env.NEXT_PUBLIC_DREAM_ENABLED === "1" ? [{ href: "/dream", key: "dream" as const }] : []),
] as const;

const CARDS = [{ id: "east" as const }, { id: "west" as const }, { id: "resonance" as const }] as const;

/**
 * Telegram 内的**唯一**导航。
 *
 * ⚠️ `AppShell.tsx` 用 `{!tg && (…)}` 把桌面侧栏与移动底栏整个包住——TG 里不渲染任何
 * web 导航。所以只往 `AppShell.NAV` 加入口的新功能，在 Telegram 里入口数是**零**。
 * 风水「境」就是这么静默失踪的：flag 已开、页面已上线、web 导航有入口，但 TG 用户
 * 走不到，而当时全套测试是绿的（`TG_ENTRIES` 此前零覆盖）。
 *
 * **加新功能时两处都要加**，门控条件也要一致。回归由 `app/__tests__/page.test.tsx` 守。
 *
 * 注：`accent` 与 `起` 同为 `--color-earth`——土是居所/方位的五行，语义上对，
 * 但两行同色；若日后调色板扩充，这里值得给「境」一个独立色。
 */
const TG_ENTRIES = [
  { icon: "运", accent: "var(--color-cinnabar)", key: "calendar" as const, path: "/calendar" },
  { icon: "盘", accent: "var(--color-water)", key: "chart" as const, path: "/chart" },
  // EP-fs-debt：此前「灵」在这里无条件显示，而 AppShell.NAV 的「灵」受
  // NEXT_PUBLIC_SPIRIT_ENABLED 门控——两处门控条件必须一致（CLAUDE.md 的教训）。
  ...(process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1"
    ? [{ icon: "灵", accent: "var(--color-metal)", key: "spirit" as const, path: "/spirit" }]
    : []),
  ...(process.env.NEXT_PUBLIC_FENGSHUI_ENABLED === "1"
    ? [{ icon: "境", accent: "var(--color-earth)", key: "fengshui" as const, path: "/fengshui" }]
    : []),
  { icon: "起", accent: "var(--color-earth)", key: "reading" as const, path: "/reading" },
  ...(process.env.NEXT_PUBLIC_DREAM_ENABLED === "1"
    ? [{ icon: "梦", accent: "var(--color-water)", key: "dream" as const, path: "/dream" }]
    : []),
  { icon: "档", accent: "var(--color-wood)", key: "profiles" as const, path: "/profiles" },
];

export default function Home() {
  const inTg = useIsTelegram();
  const router = useRouter();
  const t = useT();

  return (
    <main className="mx-auto w-full max-w-[480px] pb-16 lg:max-w-5xl">
      {!inTg && (
        <>
          {/* ===== 卷首（编辑式 hero：文字为唯一焦点，盘环线稿出血于右缘） ===== */}
          <section className="relative overflow-hidden px-7 pt-12 lg:px-16 lg:pt-20">
            <HeroWheel
              className="pointer-events-none absolute -right-24 top-10 w-[300px] lg:-right-16 lg:w-[380px]"
              style={{ opacity: 0.14 }}
            />
            <div className="zj-rise relative flex items-center gap-2.5">
              <BellLogo size={26} motion="ring" ringKey={0} />
              <span className="font-serif text-[17px] font-bold tracking-[0.14em]">{t("common.brand")}</span>
            </div>

            <div className="relative mt-24 lg:mt-32">
              <p className="zj-rise text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)", animationDelay: ".08s" }}>
                — {t("home.kickerHero")} —
              </p>
              <h1 className="zj-rise mt-4 font-serif text-[44px] font-bold leading-[1.18] lg:text-[64px]" style={{ animationDelay: ".16s" }}>
                {t("home.heroTitle1")}<br />{t("home.heroTitle2")}
              </h1>
              <p className="zj-rise mt-5 max-w-[290px] text-[13.5px] leading-[1.9] text-ink-2 lg:max-w-[400px] lg:text-[15px]" style={{ animationDelay: ".26s" }}>
                {t("home.heroSubtitle")}
              </p>
              <div className="zj-rise mt-9 flex items-center gap-6" style={{ animationDelay: ".34s" }}>
                <Link
                  href="/reading"
                  className="zj-btn inline-flex items-center justify-center px-7 py-3.5 text-[15px] font-medium transition-colors duration-200 hover:bg-[var(--color-cinnabar-press)]"
                  style={{ background: "var(--color-cinnabar)", color: "var(--color-paper)", borderRadius: "var(--radius-button)" }}
                >
                  {t("home.ctaButton")}
                </Link>
                <Link href="/calendar" className="text-[13px] text-ink-2 underline-offset-4 hover:underline">
                  {t("home.ctaSecondary")}
                </Link>
              </div>
            </div>
          </section>

          {/* ===== 目录（细线分隔的入口列表，卡片网格废除） ===== */}
          <div className="relative mt-20 px-7 lg:mx-auto lg:mt-28 lg:max-w-4xl lg:px-16">
            <p className="zj-rise text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)", animationDelay: ".4s" }}>
              — {t("home.kickerToc")} —
            </p>
            <div className="zj-rise mt-5" style={{ borderTop: "1px solid var(--color-line)", animationDelay: ".46s" }}>
              {ENTRIES.map((e) => (
                <Link
                  key={e.key}
                  href={e.href}
                  className="group flex items-center justify-between py-5"
                  style={{ borderBottom: "1px solid var(--color-line)" }}
                >
                  <div>
                    <div className="font-serif text-[19px] font-semibold">{t(`home.entries.${e.key}.title`)}</div>
                    <div className="mt-1 text-[12px] text-muted">{t(`home.entries.${e.key}.sub`)}</div>
                  </div>
                  <span className="text-[15px] text-muted transition-colors group-hover:text-ink">→</span>
                </Link>
              ))}
            </div>

            {/* 三段式说明（细线分区，去卡片） */}
            <div className="mt-16 lg:grid lg:grid-cols-3 lg:gap-10">
              {CARDS.map((c) => (
                <div key={c.id} className="py-6 lg:py-0" style={{ borderTop: "1px solid var(--color-line)" }}>
                  <div className="pt-5 text-[11px] tracking-[0.3em] text-muted lg:pt-6">{t(`home.cards.${c.id}.label`)}</div>
                  <p className="mt-3 text-[14px] leading-[1.9] text-ink-2">{t(`home.cards.${c.id}.text`)}</p>
                </div>
              ))}
            </div>

            <p className="mt-12 text-[12px] leading-relaxed text-muted">
              {t("home.disclaimer")}
            </p>
            <p className="mt-10 text-[11px] tracking-[0.2em] text-muted">
              {t("home.footerBrand")}
            </p>
          </div>
        </>
      )}

      {inTg && (
        <div className="px-5 pt-10">
          <div className="mb-5 pb-5" style={{ borderBottom: "1px solid var(--color-line)" }}>
            <p className="text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>
              — {t("home.kickerHero")} —
            </p>
            <h1 className="mt-3 font-serif text-[24px] font-bold tracking-[0.08em]">{t("common.brand")}</h1>
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
