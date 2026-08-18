"use client";

import { useState } from "react";
import type { UnifiedChart } from "@eamvp/core";
import { Markdown } from "@/components/Markdown";
import { useT } from "@/lib/i18n/I18nProvider";

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


export function ReadingTabs({ sections, chart, streaming }: { sections: ReadingSection[]; chart: UnifiedChart; streaming: boolean }) {
  const t = useT();
  const [tab, setTab] = useState<"命理" | "心理" | "共振">("命理");
  const byAccent = (a: string) => sections.find((s) => s.accent === a);
  const overview = sections.find((s) => !s.accent);

  const TABS = [
    { k: "命理" as const, label: t("chart.tabMingli"), kicker: t("chart.kickerMingli"), sec: byAccent("fire"), chips: liChips(chart) },
    { k: "心理" as const, label: t("chart.tabPsych"), kicker: t("chart.kickerPsych"), sec: byAccent("water"), chips: xinChips(chart) },
    { k: "共振" as const, label: t("chart.tabResonance"), kicker: t("chart.kickerResonance"), sec: byAccent("metal"), chips: [t("chart.resonanceExampleChip")] },
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

      {/* 概览引言 */}
      {overview?.body && (
        <p className="mt-4 font-serif text-[16px] leading-[1.7] text-ink-2">{overview.body.replace(/[*#>]/g, "")}</p>
      )}

      {/* sticky Tab */}
      <div className="sticky top-[3px] z-10 mt-4 py-2" style={{ background: "var(--color-paper)" }}>
        <div className="flex gap-1 p-1" style={{ background: "var(--color-tint)", borderRadius: "var(--radius-button)" }}>
          {TABS.map((item) => {
            const on = item.k === tab;
            return (
              <button
                key={item.k}
                onClick={() => setTab(item.k)}
                className="flex-1 py-2.5 text-[13.5px] font-medium transition-colors duration-200"
                style={{ borderRadius: "var(--radius-chip)", background: on ? "var(--color-surface)" : "transparent", color: on ? "var(--color-ink)" : "var(--color-muted)", border: on ? "1px solid var(--color-line)" : "1px solid transparent" }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 摘要先行卡（细线描边，无阴影；顶边 2px 五行语义色） */}
      <div
        key={tab}
        className="zj-rise mt-3 p-6"
        style={{
          borderRadius: "var(--radius-card)",
          background: "var(--color-surface)",
          color: "var(--color-ink)",
          border: "1px solid var(--color-line)",
          borderTop: `2px solid var(--color-${tab === "命理" ? "fire" : tab === "心理" ? "water" : "metal"})`,
        }}
      >
        <div className="text-[11px] tracking-[0.2em]" style={{ color: "var(--color-muted)" }}>{cur.kicker}</div>
        {head ? (
          <div className="mt-2 font-serif text-[21px] font-bold leading-[1.5]">{head}</div>
        ) : (
          <div className="mt-2 text-[14px]" style={{ color: "var(--color-muted)" }}>{streaming ? t("chart.generating") : "—"}</div>
        )}
        {cur.chips.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {cur.chips.map((ch, i) => (
              <span key={i} className="px-2.5 py-1 text-[12px]" style={{ borderRadius: "var(--radius-chip)", background: "var(--color-tint)", color: "var(--color-ink-2)" }}>{ch}</span>
            ))}
          </div>
        )}
        {rest && (
          <div className="reading-prose mt-3.5">
            <Markdown text={rest} />
          </div>
        )}
        {tab === "共振" && <div className="mt-3.5 text-[11px] leading-[1.6]" style={{ color: "var(--color-muted)" }}>{t("chart.resonanceNote")}</div>}
      </div>

      <p className="mt-3 text-[12px] text-muted">
        {streaming ? <>{t("chart.generating")} <span className="animate-pulse text-cinnabar">▋</span></> : t("chart.readingSaved")}
      </p>
    </div>
  );
}
