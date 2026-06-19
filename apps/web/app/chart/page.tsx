"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveProfile, saveReading, type Profile } from "@/lib/profiles";
import { timelineAction } from "@/app/actions";
import { Card } from "@/components/ui";
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
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [reading, setReading] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<string | null>(null);

  useEffect(() => {
    getActiveProfile()
      .then((p) => {
        setProfile(p);
        if (p?.reading) setReading(p.reading); // 已生成则直接展示，不再调用 LLM
        if (p) loadTimeline(p);
      })
      .catch(() => setProfile(null));
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
    let full = "";
    try {
      const res = await fetch("/api/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile.birthInput),
      });
      if (!res.ok || !res.body) {
        setErr(await res.text());
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const t = dec.decode(value, { stream: true });
        full += t;
        setReading((p) => p + t);
      }
      // 生成完毕 → 保存到档案（一次生成，之后不再重算）
      if (full.trim()) {
        try {
          await saveReading(profile.id, full);
        } catch (e) {
          console.error("saveReading failed:", e);
        }
        setProfile({ ...profile, reading: full });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming(false);
    }
  }

  if (profile === undefined) return <Centered>正在读取档案…</Centered>;
  if (profile === null)
    return (
      <Centered>
        <p className="text-ink-2">尚无命盘档案。</p>
        <Link href="/reading" className="mt-4 inline-block px-6 py-3 text-on-ink" style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}>
          去起盘
        </Link>
      </Centered>
    );

  const chart = profile.chart;
  const sections = reading ? splitSections(reading) : [];

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold">{profile.nickname} · 命盘</h1>
          <p className="latin-label mt-1 text-[11px] text-muted">{chart.normalizedSolarTime}</p>
        </div>
        <Link href="/calendar" className="text-[13px] text-gold underline underline-offset-4">今日运势 →</Link>
      </header>

      {/* 八字 + 五行 */}
      <Section title="八字四柱">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
          <Card><BaziPillars bazi={chart.bazi} /></Card>
          <Card><WuxingRadar counts={chart.bazi.fiveElementCounts} /></Card>
        </div>
      </Section>

      {/* 紫微 */}
      <Section title="紫微斗数 · 十二宫">
        <Card><ZiweiBoard ziwei={chart.ziwei} /></Card>
      </Section>

      {/* 西方本命盘（降级隐藏） */}
      {chart.western ? (
        <Section title="西方本命盘 · 心理映照">
          <Card><NatalWheel western={chart.western} /></Card>
        </Section>
      ) : (
        <Section title="西方本命盘 · 心理映照">
          <Card><p className="text-[14px] text-muted">缺出生时辰或出生地，已略去西方星盘与心理层。补全后可解锁。</p></Card>
        </Section>
      )}

      {/* 三段式解读 */}
      <Section title="三段式解读">
        {!reading && !streaming && (
          <button
            onClick={generate}
            className="group flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-all duration-200 hover:bg-cinnabar-press"
            style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-card)", color: "var(--color-on-ink)" }}
          >
            <span>
              <span className="block text-[17px] font-semibold">为我照见 · 生成完整解读</span>
              <span className="mt-1 block text-[13px] opacity-85">命盘已就位 —— 用命理结构 + 深层心理，读出你的核心自我、成长课题与一句此刻之言</span>
            </span>
            <span className="text-[22px] transition-transform duration-200 group-hover:translate-x-1">✦</span>
          </button>
        )}
        {streaming && !reading && (
          <Card><p className="text-[14px] text-muted">正在为你照见… <span className="animate-pulse text-cinnabar">▋</span></p></Card>
        )}
        {err && (
          <div className="px-4 py-3 text-[13px]" style={{ borderRadius: "var(--radius-card)", background: "#FBEEEC", color: "var(--color-seal)", border: "1px solid #EFD6D2" }}>{err}</div>
        )}
        {reading && (
          <div className="grid gap-4">
            {sections.map((s) => (
              <Card key={s.key} topAccent={s.accent} dark={s.accent === "metal"}>
                <h3 className="text-[17px] font-semibold">{s.title}</h3>
                <div className="reading-prose mt-2 whitespace-pre-wrap">{s.body}</div>
              </Card>
            ))}
            {streaming ? (
              <p className="text-[12px] text-muted">正在为你照见… <span className="animate-pulse text-cinnabar">▋</span></p>
            ) : (
              <p className="text-[12px] text-muted">此解读已为你保存，下次回到命盘可直接查看。</p>
            )}
          </div>
        )}
      </Section>

      {timeline && (
        <Section title="当下时序">
          <Card topAccent="metal">
            <div className="reading-prose whitespace-pre-wrap">{timeline.replace(/^##\s*本年时序\s*/, "")}</div>
            <p className="mt-3 text-[11px] text-muted">时序按当前年份（{YEAR}）的大限/流年推算，随年更新；仅供自我观照，非事件预测。</p>
          </Card>
        </Section>
      )}

      <p className="mt-10 text-[12px] leading-relaxed text-muted">
        命盘为建档时一次推算并冻结。所有解读仅供自我观照，不构成医疗、法律、财务或心理诊断建议。
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-[15px] font-semibold text-ink-2"><span className="text-cinnabar">— </span>{title}</h2>
      {children}
    </section>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
