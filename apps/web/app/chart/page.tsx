"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveProfile, saveReading, type Profile } from "@/lib/profiles";
import { hasTgSession, isTelegram, tgGetProfile } from "@/lib/tg/client";
import { useIsTelegram, useTgMainButton, haptics } from "@/lib/tg/ui";
import { timelineAction } from "@/app/actions";
import { Card } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { Markdown } from "@/components/Markdown";
import { ReadingTabs } from "@/components/ReadingTabs";
import { BaziPillars } from "@/components/charts/BaziPillars";
import { ZiweiBoard } from "@/components/charts/ZiweiBoard";
import { WuxingRadar } from "@/components/charts/WuxingRadar";
import { NatalWheel } from "@/components/charts/NatalWheel";

type Section = { key: string; title: string; body: string; accent?: "fire" | "water" | "metal" };

function splitSections(md: string): Section[] {
  const parts = md.split(/^##\s+/m).filter(Boolean);
  return parts.map((p, i) => {
    const nl = p.indexOf("\n");
    const title = (nl === -1 ? p : p.slice(0, nl)).trim();
    const body = (nl === -1 ? "" : p.slice(nl + 1)).trim();
    const accent = title.includes("命理") ? "fire" : title.includes("心理") ? "water" : /成长|建议|共振/.test(title) ? "metal" : undefined;
    return { key: `${i}-${title}`, title, body, accent };
  });
}

const YEAR = new Date().getFullYear();
const todayYmd = `${YEAR}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;

export default function ChartPage() {
  const { locale } = useLocale();
  const t = useT();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [reading, setReading] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<string | null>(null);

  const inTg = useIsTelegram();

  useTgMainButton({
    text: streaming ? t("chart.generating") : t("chart.castForMe"),
    onClick: () => generate(),
    enabled: !streaming,
    visible: inTg && !reading,
  });

  useEffect(() => {
    (async () => {
      try {
        const p = hasTgSession() ? await tgGetProfile() : await getActiveProfile();
        setProfile(p);
        if (p?.reading) setReading(p.reading); // 已生成则直接展示，不再调用 LLM
        if (p) {
          loadTimeline(p);
        }
      } catch {
        setProfile(null);
      }
    })();
  }, []);

  // 当下时序：按 (档案,年份) 缓存，避免重复调 LLM
  async function loadTimeline(p: Profile) {
    const key = `zhaojian.timeline.${p.id}.${YEAR}`;
    try {
      const cached = localStorage.getItem(key);
      if (cached) { setTimeline(cached); return; }
    } catch { /* ignore */ }
    const md = await timelineAction(p.birthInput, p.chart, todayYmd);
    if (md) {
      setTimeline(md);
      try { localStorage.setItem(key, md); } catch { /* ignore */ }
    }
  }

  async function generate() {
    if (!profile) return;
    setStreaming(true);
    setReading("");
    setErr(null);
    // 打字机：把（按行到达的）文本逐字铺出，标点处自然停顿——书写感，而非整段刷新
    let target = "";
    let shown = 0;
    let streamDone = false;
    let pause = 0;
    let rafId = 0;

    const finalize = async () => {
      setReading(target);
      if (target.trim()) {
        try { await saveReading(profile.id, target); } catch (e) { console.error("saveReading failed:", e); }
        setProfile({ ...profile, reading: target });
      }
      setStreaming(false);
      haptics.success();
    };
    const tick = () => {
      if (pause > 0) {
        pause--;
      } else if (shown < target.length) {
        const remaining = target.length - shown;
        // 接近书写速度：通常 1–2 字/帧(~60–120cps)，落后太多时追赶，临近收尾放慢
        const step = remaining > 500 ? 5 : remaining > 120 ? 2 : 1;
        const last = target[shown + step - 1] ?? "";
        shown += step;
        setReading(target.slice(0, shown));
        if (/[。！？\n]/.test(last)) pause = 7;        // 句末停顿 ~115ms
        else if (/[，、；：]/.test(last)) pause = 3;   // 读断停顿 ~50ms
      }
      if (shown < target.length || !streamDone) rafId = requestAnimationFrame(tick);
      else void finalize();
    };
    rafId = requestAnimationFrame(tick);

    try {
      const res = await fetch("/api/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-zj-locale": locale },
        body: JSON.stringify(profile.birthInput),
      });
      if (!res.ok || !res.body) {
        cancelAnimationFrame(rafId);
        setErr(await res.text());
        setStreaming(false);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        target += dec.decode(value, { stream: true });
      }
      streamDone = true; // tick 追平后自行 finalize（保存+收尾）
    } catch (e) {
      cancelAnimationFrame(rafId);
      setErr(e instanceof Error ? e.message : String(e));
      setStreaming(false);
    }
  }

  if (profile === undefined) return <Centered>{t("chart.loadingProfile")}</Centered>;
  if (profile === null)
    return (
      <Centered>
        <p className="text-ink-2">{t("chart.noProfile")}</p>
        <Link href="/reading" className="mt-4 inline-block px-6 py-3 text-on-ink" style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}>
          {t("chart.goCast")}
        </Link>
      </Centered>
    );

  const chart = profile.chart;
  const sections = reading ? splitSections(reading) : [];

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
      <PageHeader
        kicker="命 盘"
        title={<>{profile.nickname} · {t("chart.title")}</>}
        annotation={chart.normalizedSolarTime}
        action={
          <>
            {isTelegram() && (
              <button
                onClick={() => {
                  const username = process.env.NEXT_PUBLIC_TG_BOT_USERNAME || "analyst_helen_bot";
                  window.Telegram?.WebApp?.openTelegramLink?.(
                    "https://t.me/share/url?url=" +
                      encodeURIComponent(`https://t.me/${username}?startapp=zhaojian`) +
                      "&text=" +
                      encodeURIComponent(t("chart.shareText"))
                  );
                }}
                className="text-[13px] text-cinnabar underline underline-offset-4"
              >
                {t("chart.share")}
              </button>
            )}
            <Link href="/calendar" className="text-[13px] text-gold underline underline-offset-4">{t("chart.todayFortune")}</Link>
          </>
        }
      />

      {/* 四柱 */}
      <ChartBlock label="四 柱">
        <BaziPillars bazi={chart.bazi} />
      </ChartBlock>

      {/* 五行 */}
      <ChartBlock label="五 行">
        <WuxingRadar counts={chart.bazi.fiveElementCounts} />
      </ChartBlock>

      {/* 紫微 */}
      <ChartBlock label="紫 微">
        <ZiweiBoard ziwei={chart.ziwei} />
      </ChartBlock>

      {/* 西方本命盘（降级隐藏） */}
      <ChartBlock label="星 盘">
        {chart.western ? (
          <NatalWheel western={chart.western} />
        ) : (
          <p className="text-[14px] text-muted">{t("chart.westernMissing")}</p>
        )}
      </ChartBlock>

      {/* 三段式解读 */}
      <ChartBlock label={t("chart.readingTitle")}>
        {!inTg && !reading && !streaming && (
          <button
            onClick={generate}
            className="group flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-all duration-200 hover:bg-cinnabar-press"
            style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-card)", color: "var(--color-on-ink)" }}
          >
            <span>
              <span className="block text-[17px] font-semibold">{t("chart.generateReading")}</span>
              <span className="mt-1 block text-[13px] opacity-85">{t("chart.generateReadingSub")}</span>
            </span>
            <span className="text-[22px] transition-transform duration-200 group-hover:translate-x-1">✦</span>
          </button>
        )}
        {streaming && !reading && (
          <Card><p className="text-[14px] text-muted">{t("chart.generating")} <span className="animate-pulse text-cinnabar">▋</span></p></Card>
        )}
        {err && (
          <div className="px-4 py-3 text-[13px]" style={{ borderRadius: "var(--radius-card)", background: "var(--color-error-bg)", color: "var(--color-seal)", border: "1px solid var(--color-error-line)" }}>{err}</div>
        )}
        {reading && <ReadingTabs sections={sections} chart={chart} streaming={streaming} />}
      </ChartBlock>

      {timeline && (
        <ChartBlock label={t("chart.timelineTitle")}>
          <Card topAccent="metal">
            <div className="reading-prose"><Markdown text={timeline.replace(/^##\s*本年时序\s*/, "")} /></div>
            <p className="mt-3 text-[11px] text-muted">{t("chart.timelineDisclaimer", { year: YEAR })}</p>
          </Card>
        </ChartBlock>
      )}

      <p className="mt-10 text-[12px] leading-relaxed text-muted">
        {t("chart.pageDisclaimer")}
      </p>
    </main>
  );
}

// 图表区块：小标签 + 直接落纸底，区块间 1px 细线分隔（取代旧 Section 的朱砂破折号 + Card 包装）
function ChartBlock({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-10 pt-8" style={{ borderTop: "1px solid var(--color-line)" }}>
      <h2 className="mb-6 text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>{label}</h2>
      {children}
    </section>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
