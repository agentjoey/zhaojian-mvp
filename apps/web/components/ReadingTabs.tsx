"use client";

import { useState } from "react";
import type { UnifiedChart } from "@eamvp/core";
import { Markdown } from "@/components/Markdown";

export type ReadingSection = { key: string; title: string; body: string; accent?: "fire" | "water" | "metal" };

const SIGN_CN: Record<string, string> = {
  Aries: "白羊", Taurus: "金牛", Gemini: "双子", Cancer: "巨蟹", Leo: "狮子", Virgo: "处女",
  Libra: "天秤", Scorpio: "天蝎", Sagittarius: "射手", Capricorn: "摩羯", Aquarius: "水瓶", Pisces: "双鱼",
};
const STRENGTH_CN: Record<string, string> = { strong: "身偏强", weak: "身偏弱", balanced: "身中和", unknown: "" };

/** 摘要先行：优先取「短首行」作凝练结论；否则退而取首句。其余为正文。 */
function splitHead(body: string): { head: string; rest: string } {
  const text = body.trim();
  if (!text) return { head: "", rest: "" };
  const nl = text.indexOf("\n");
  const firstLine = (nl >= 0 ? text.slice(0, nl) : text).replace(/[*#>]/g, "").trim();
  if (nl >= 0 && firstLine.length <= 24) return { head: firstLine, rest: text.slice(nl + 1).trim() };
  const m = text.match(/^[\s\S]*?[。！？]/);
  const head = (m ? m[0] : text.slice(0, 30)).replace(/[*#>]/g, "").trim();
  const rest = m ? text.slice(m[0].length).trim() : "";
  return { head, rest: rest || text };
}

function liChips(c: UnifiedChart): string[] {
  const z = c.ziwei;
  const ming = z.palaces.find((p) => p.name.includes("命"));
  const out: string[] = [];
  const star = ming?.majorStars[0];
  if (star) out.push(star.name + (star.mutagen ? `化${star.mutagen}` : "")); else out.push("命宫空宫");
  if (z.birthMutagens.忌) out.push(`${z.birthMutagens.忌}化忌`);
  out.push(`日主${c.bazi.dayMaster}${STRENGTH_CN[c.bazi.dayMasterStrength] ?? ""}`);
  return out.filter(Boolean).slice(0, 3);
}
function xinChips(c: UnifiedChart): string[] {
  const w = c.western;
  if (!w) return [];
  const find = (n: string) => w.planets.find((p) => p.name.toLowerCase() === n);
  const sun = find("sun"), moon = find("moon"), saturn = find("saturn");
  const out: string[] = [];
  if (moon) out.push(`月亮${SIGN_CN[moon.sign] ?? moon.sign}`);
  if (sun) out.push(`太阳${SIGN_CN[sun.sign] ?? sun.sign}`);
  out.push(saturn ? `土星${saturn.house}宫` : `上升${SIGN_CN[w.ascendant.sign] ?? w.ascendant.sign}`);
  return out.slice(0, 3);
}

// 高亮标签（随 Tab 指向命盘对应处）
function hlLabelOf(tab: "命理" | "心理" | "共振", c: UnifiedChart): string {
  if (tab === "命理") {
    const star = c.ziwei.palaces.find((p) => p.name.includes("命"))?.majorStars[0];
    return star ? `命宫 · ${star.name}${star.mutagen ? `化${star.mutagen}` : ""}` : "命宫 · 空宫借星";
  }
  if (tab === "心理") {
    const sat = c.western?.planets.find((p) => p.name.toLowerCase() === "saturn");
    return sat ? `土星 · 第${sat.house}宫` : "月亮 · 土星";
  }
  return "内在世界轴 · 福德宫";
}
// 弧线偏移/旋转（随 Tab；与设计稿一致）
const ARC: Record<"命理" | "心理" | "共振", { off: number; rot: number }> = {
  命理: { off: 547, rot: -10 },
  心理: { off: 547, rot: 110 },
  共振: { off: 430, rot: 200 },
};

/** 命盘 hero：缓慢自转环 + 随 Tab 旋转定位的朱色高亮弧。 */
function ChartHero({ tab, chart }: { tab: "命理" | "心理" | "共振"; chart: UnifiedChart }) {
  const arc = ARC[tab];
  const dayPillar = chart.bazi.pillars.day.stem + chart.bazi.pillars.day.branch;
  return (
    <div className="text-center">
      <svg viewBox="0 0 280 280" style={{ width: 210, height: 210 }} aria-hidden>
        <circle cx="140" cy="140" r="128" fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth="1.4" />
        <circle cx="140" cy="140" r="104" fill="none" stroke="var(--color-spoke)" strokeWidth="1" />
        <circle cx="140" cy="140" r="46" fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth="1" />
        {/* 高亮弧（随 Tab 旋转） */}
        <circle cx="140" cy="140" r="116" fill="none" stroke="var(--color-cinnabar)" strokeWidth="3" strokeLinecap="round"
          strokeDasharray="729" strokeDashoffset={arc.off} transform={`rotate(${arc.rot} 140 140)`}
          style={{ transition: "stroke-dashoffset .6s ease, transform .6s var(--ease-rise)" }} />
        <g stroke="var(--color-spoke)" strokeWidth=".9">
          {Array.from({ length: 12 }, (_, i) => (
            <line key={i} x1="140" y1="12" x2="140" y2="60" style={{ transform: `rotate(${i * 30}deg)`, transformOrigin: "140px 140px" }} />
          ))}
        </g>
        <text x="140" y="135" textAnchor="middle" fontFamily="var(--font-serif)" fontSize="15" fontWeight="700" fill="var(--color-ink)">{dayPillar}</text>
        <text x="140" y="153" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="9" fill="var(--color-muted)">{chart.ziwei.fiveElementBureau}</text>
      </svg>
      <div className="-mt-1 text-[12px] text-muted">高亮：{hlLabelOf(tab, chart)}</div>
    </div>
  );
}

export function ReadingTabs({ sections, chart, streaming }: { sections: ReadingSection[]; chart: UnifiedChart; streaming: boolean }) {
  const [tab, setTab] = useState<"命理" | "心理" | "共振">("命理");
  const byAccent = (a: string) => sections.find((s) => s.accent === a);
  const overview = sections.find((s) => !s.accent);

  const TABS = [
    { k: "命理" as const, kicker: "East · 命理结构", sec: byAccent("fire"), chips: liChips(chart), dark: false },
    { k: "心理" as const, kicker: "West · 心理映照", sec: byAccent("water"), chips: xinChips(chart), dark: false },
    { k: "共振" as const, kicker: "Resonance · 共振", sec: byAccent("metal"), chips: ["福德宫 ↔ 月亮 · 土星"], dark: true },
  ];
  const progress = { 命理: "34%", 心理: "67%", 共振: "100%" }[tab];
  const cur = TABS.find((t) => t.k === tab)!;
  const { head, rest } = splitHead(cur.sec?.body ?? "");

  return (
    <div>
      {/* 阅读进度 */}
      <div className="sticky top-0 z-20 h-[3px]" style={{ background: "var(--color-line)" }}>
        <div className="h-full transition-[width] duration-500" style={{ width: progress, background: "var(--color-cinnabar)", transitionTimingFunction: "var(--ease-rise)" }} />
      </div>

      {/* 命盘 hero（高亮弧随 Tab 旋转） */}
      <div className="mt-4">
        <ChartHero tab={tab} chart={chart} />
      </div>

      {/* 概览引言 */}
      {overview?.body && (
        <p className="mt-3 font-serif text-[15px] leading-[1.7] text-ink-2">{overview.body.replace(/[*#>]/g, "")}</p>
      )}

      {/* sticky Tab */}
      <div className="sticky top-[3px] z-10 mt-4 py-2" style={{ background: "var(--color-paper)" }}>
        <div className="flex gap-1 p-1" style={{ background: "var(--color-tint)", borderRadius: "13px" }}>
          {TABS.map((t) => {
            const on = t.k === tab;
            return (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className="flex-1 py-2.5 text-[13.5px] font-medium transition-all duration-200"
                style={{ borderRadius: "10px", background: on ? "var(--color-surface)" : "transparent", color: on ? "var(--color-ink)" : "var(--color-muted)", boxShadow: on ? "0 2px 8px rgba(31,29,25,.1)" : "none" }}
              >
                {t.k}
              </button>
            );
          })}
        </div>
      </div>

      {/* 摘要先行卡 */}
      <div
        key={tab}
        className="zj-rise mt-3 p-6"
        style={{
          borderRadius: "18px",
          background: cur.dark ? "var(--color-ink)" : "var(--color-surface)",
          color: cur.dark ? "var(--color-on-ink)" : "var(--color-ink)",
          boxShadow: cur.dark ? "var(--shadow-panel)" : "var(--shadow-soft)",
          borderTop: `3px solid var(--color-${cur.dark ? "metal" : tab === "命理" ? "fire" : "water"})`,
        }}
      >
        <div className="latin-label text-[11px]" style={{ color: cur.dark ? "var(--color-on-ink-gold)" : "var(--color-muted)" }}>{cur.kicker}</div>
        {head ? (
          <div className="mt-2 font-serif text-[21px] font-bold leading-[1.5]">{head}</div>
        ) : (
          <div className="mt-2 text-[14px]" style={{ color: cur.dark ? "var(--color-on-ink-muted)" : "var(--color-muted)" }}>{streaming ? "正在为你照见…" : "—"}</div>
        )}
        {cur.chips.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {cur.chips.map((ch, i) => (
              <span key={i} className="px-2.5 py-1 text-[12px]" style={{ borderRadius: "9px", background: cur.dark ? "#34322C" : "var(--color-tint)", color: cur.dark ? "var(--color-on-ink-muted)" : "var(--color-ink-2)" }}>{ch}</span>
            ))}
          </div>
        )}
        {rest && (
          <div className="reading-prose mt-3.5" style={cur.dark ? { color: "var(--color-on-ink-muted)" } : undefined}>
            <Markdown text={rest} />
          </div>
        )}
        {cur.dark && <div className="mt-3.5 text-[11px] leading-[1.6]" style={{ color: "var(--color-on-ink-faint)" }}>※ 仅在「内在世界」高置信锚点谈共振，非硬等价。</div>}
      </div>

      <p className="mt-3 text-[12px] text-muted">
        {streaming ? <>正在为你照见… <span className="animate-pulse text-cinnabar">▋</span></> : "此解读已为你保存，下次回到命盘可直接查看。"}
      </p>
    </div>
  );
}
