"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { dailyFortuneAction, dailyPolishAction, dailyBehaviorAction, ziweiHoroscopeAction } from "@/app/actions";
import { matchFortuneImage, MOOD_LABEL } from "@/lib/fortune-images";
import { Card, GanzhiBadge } from "@/components/ui";
import { ScoreRing } from "@/components/ScoreRing";
import { CastingOverlay } from "@/components/CastingOverlay";
import type { DailyFortune, ZiweiHoroscope } from "@eamvp/core";

// 按 (档案,日期,kind) 缓存 LLM 结果到 localStorage，避免重复调用
function cacheGet(kind: string, pid: string, date: string): string | null {
  try { return localStorage.getItem(`zhaojian.${kind}.${pid}.${date}`); } catch { return null; }
}
function cacheSet(kind: string, pid: string, date: string, v: string): void {
  try { localStorage.setItem(`zhaojian.${kind}.${pid}.${date}`, v); } catch { /* ignore */ }
}

// 五行配色（与 design token 一致）
const ELEMENT_COLOR: Record<string, string> = {
  木: "var(--color-wood)", 火: "var(--color-fire)", 土: "var(--color-earth)", 金: "var(--color-metal)", 水: "var(--color-water)",
};
// 综合分 → 大字总评
function gradeOf(overall: number): { glyph: string; label: string } {
  if (overall >= 8) return { glyph: "吉", label: "宜进取" };
  if (overall >= 6) return { glyph: "顺", label: "可推进" };
  if (overall >= 4) return { glyph: "平", label: "守稳健" };
  return { glyph: "谨", label: "宜守静" };
}

type Behavior = { do: string[]; dont: string[] };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function weekDays(today: Date): Date[] {
  const sun = new Date(today);
  sun.setDate(today.getDate() - today.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sun);
    d.setDate(sun.getDate() + i);
    return d;
  });
}
const WK = ["日", "一", "二", "三", "四", "五", "六"];
const DIMS: { key: keyof DailyFortune["scores"]; label: string }[] = [
  { key: "career", label: "事业" },
  { key: "wealth", label: "财运" },
  { key: "love", label: "感情" },
  { key: "health", label: "健康" },
  { key: "travel", label: "出行" },
];

export default function CalendarPage() {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [today] = useState(() => new Date());
  const [selected, setSelected] = useState(() => ymd(new Date()));
  const [fortune, setFortune] = useState<DailyFortune | null>(null);
  const [polish, setPolish] = useState<string | null>(null);
  const [behavior, setBehavior] = useState<Behavior | null>(null);
  const [horoscope, setHoroscope] = useState<ZiweiHoroscope | null>(null);
  const [loading, setLoading] = useState(false);
  const [casting, setCasting] = useState(false); // 进入运势的品牌化过场（每会话一次）
  const selYear = selected.slice(0, 4);

  useEffect(() => {
    getActiveProfile().then(setProfile).catch(() => setProfile(null));
  }, []);

  // 测算过场：每会话首次进入运势播 ~2.1s
  useEffect(() => {
    try {
      if (sessionStorage.getItem("zj.cast")) return;
      sessionStorage.setItem("zj.cast", "1");
    } catch { /* ignore */ }
    setCasting(true);
    const t = setTimeout(() => setCasting(false), 2100);
    return () => clearTimeout(t);
  }, []);

  // 本年/本限 时序上下文（确定性，按年取）
  useEffect(() => {
    const p = profile;
    if (!p) return;
    let alive = true;
    ziweiHoroscopeAction(p.birthInput, selected).then((h) => { if (alive) setHoroscope(h); });
    return () => { alive = false; };
  }, [profile, selYear]);

  useEffect(() => {
    const p = profile;
    if (!p) return;
    let alive = true;
    setLoading(true);
    setPolish(cacheGet("polish", p.id, selected)); // 命中缓存先显示
    const bCache = cacheGet("behavior", p.id, selected);
    setBehavior(bCache ? (JSON.parse(bCache) as Behavior) : null);
    dailyFortuneAction({ bazi: p.chart.bazi }, selected)
      .then((f) => {
        if (!alive) return;
        setFortune(f);
        // 轻润色 + 心理行为宜忌：各自缓存未命中才调 LLM
        if (!cacheGet("polish", p.id, selected)) {
          dailyPolishAction(f, p.nickname).then((line) => {
            if (alive && line) { setPolish(line); cacheSet("polish", p.id, selected, line); }
          });
        }
        if (!cacheGet("behavior", p.id, selected)) {
          dailyBehaviorAction(f, p.nickname).then((b) => {
            if (alive && b) { setBehavior(b); cacheSet("behavior", p.id, selected, JSON.stringify(b)); }
          });
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [profile, selected]);

  if (profile === undefined) return <Centered>正在读取档案…</Centered>;
  if (profile === null)
    return (
      <Centered>
        <p className="text-ink-2">尚无命盘档案，无法生成每日运势。</p>
        <Link href="/reading" className="mt-4 inline-block px-6 py-3 text-on-ink" style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}>去起盘</Link>
      </Centered>
    );

  const days = weekDays(today);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
      {casting && <CastingOverlay gan={(fortune?.dayGanZhi ?? "庚申")[0]} zhi={(fortune?.dayGanZhi ?? "庚申")[1]} seal="今" />}
      <header className="mb-6">
        <h1 className="font-serif text-[28px] font-black">运势日历</h1>
        <p className="mt-1 text-[13px] text-muted">{profile.nickname} · 命主 {profile.chart.bazi.dayMaster}（{profile.chart.bazi.dayMasterElement}）</p>
      </header>

      {/* 本年/本限 时序上下文（大背景 → 今日） */}
      {horoscope && (
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[var(--radius-card)] px-4 py-3" style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)" }}>
          <span className="text-[13px] text-ink-2">本限 <b className="font-semibold">{horoscope.decadal.stem}{horoscope.decadal.branch}</b></span>
          <span className="text-[13px] text-ink-2">{selYear} 流年 <b className="font-semibold">{horoscope.yearly.stem}{horoscope.yearly.branch}</b></span>
          <span className="text-[12px] text-muted">流年化忌 <b className="text-cinnabar">{horoscope.yearly.mutagens.忌}</b>（今年功课）· 化禄 <b className="text-wood">{horoscope.yearly.mutagens.禄}</b>（顺势）</span>
          <Link href="/chart" className="ml-auto shrink-0 text-[12px] text-gold underline underline-offset-4">本年时序 →</Link>
        </div>
      )}

      {/* 本周日历条 */}
      <div className="mb-6 grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const ds = ymd(d);
          const isSel = ds === selected;
          const isToday = ds === ymd(today);
          return (
            <button
              key={ds}
              onClick={() => setSelected(ds)}
              className="flex flex-col items-center py-2 transition-all"
              style={{
                borderRadius: "var(--radius-card)",
                background: isSel ? "var(--color-ink)" : "var(--color-surface)",
                color: isSel ? "var(--color-on-ink)" : "var(--color-ink)",
                border: `1px solid ${isToday && !isSel ? "var(--color-cinnabar)" : "var(--color-line)"}`,
              }}
            >
              <span className="text-[10px]" style={{ color: isSel ? "var(--color-on-ink-muted)" : "var(--color-muted)" }}>{WK[d.getDay()]}</span>
              <span className="font-latin text-[17px] leading-tight">{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      {loading || !fortune ? (
        <Card><p className="text-[14px] text-muted">正在推算当日流日…</p></Card>
      ) : (
        <div className="space-y-4">
          {/* 今日运势 hero（每日配图作背景 + 评分环） */}
          {(() => {
            const img = matchFortuneImage(fortune.relation, selected);
            const g = gradeOf(fortune.scores.overall);
            const yi = behavior?.do[0] ?? fortune.auspicious[0] ?? "顺势而为";
            const ji = behavior?.dont[0] ?? fortune.caution[0] ?? "勿强求";
            return (
              <div className="zj-rise relative overflow-hidden" style={{ borderRadius: "var(--radius-panel)", background: "var(--color-ink)", boxShadow: "var(--shadow-panel)" }}>
                {img && <img src={img.file} alt={img.alt} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
                <div className="absolute inset-0" style={{ background: "linear-gradient(155deg,rgba(20,18,16,.72),rgba(20,18,16,.82) 55%,rgba(20,18,16,.93))" }} />
                <div className="relative p-6 text-on-ink">
                  <div className="flex items-center gap-5">
                    <ScoreRing score={fortune.scores.overall} max={10} size={104} label={g.glyph + " · 今日"} />
                    <div className="min-w-0 flex-1">
                      <div className="latin-label text-[11px] text-on-ink-gold">Today · {MOOD_LABEL[fortune.relation]}</div>
                      <div className="my-2.5 flex gap-2">
                        <GanzhiBadge char={fortune.dayGanZhi[0]!} size={40} />
                        <GanzhiBadge char={fortune.dayGanZhi[1]!} size={40} />
                      </div>
                      <div className="text-[13px] leading-[1.6] text-on-ink-muted">{fortune.tone}</div>
                    </div>
                  </div>
                  <div className="my-4 h-px" style={{ background: "rgba(255,255,255,.16)" }} />
                  {polish && (
                    <p className="flex items-start gap-2 text-[13.5px] leading-[1.9]" style={{ color: "var(--color-on-ink-gold)" }}><span aria-hidden>✦</span><span>{polish}</span></p>
                  )}
                  <div className="mt-4 flex gap-2">
                    <span className="flex-1 truncate text-center text-[13px]" style={{ padding: "9px", border: "1px solid #4A463B", borderRadius: "var(--radius-chip)", color: "#9FCBB4" }}>宜 · {yi}</span>
                    <span className="flex-1 truncate text-center text-[13px]" style={{ padding: "9px", background: "var(--color-cinnabar)", borderRadius: "var(--radius-chip)", color: "#fff" }}>忌 · {ji}</span>
                  </div>
                  {(fortune.favorableToday || fortune.interactions.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {fortune.favorableToday && <span className="rounded-full px-2.5 py-0.5 text-[11px]" style={{ background: "rgba(199,168,120,.2)", color: "var(--color-on-ink-gold)" }}>今日喜用</span>}
                      {fortune.interactions.map((it, i) => (
                        <span key={i} className="rounded-full px-2.5 py-0.5 text-[11px]" style={{ background: "rgba(255,255,255,.08)", color: "var(--color-on-ink-muted)" }} title={it.note}>流日{it.kind}命{it.withPillar}支</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 五维评分 */}
          <Card>
            <div className="space-y-2.5">
              {DIMS.map((d) => (
                <div key={d.key} className="flex items-center gap-3">
                  <span className="w-8 text-[13px] text-ink-2">{d.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--color-tint)" }}>
                    <div className="h-full rounded-full" style={{ width: `${fortune.scores[d.key] * 10}%`, background: "var(--color-cinnabar)" }} />
                  </div>
                  <span className="font-latin w-5 text-right text-[13px] text-muted">{fortune.scores[d.key]}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* 今日宜忌：优先心理行为版（LLM，现代可执行），降级用确定性趋吉避祸 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card topAccent="wood">
              <h3 className="text-[15px] font-semibold" style={{ color: "var(--color-wood)" }}>{behavior ? "今日宜" : "趋吉 · 宜"}</h3>
              <ul className="mt-2 space-y-1.5 text-[14px] text-ink-2">
                {(behavior?.do ?? fortune.auspicious).map((t, i) => <li key={i} className="flex gap-1.5"><span className="text-wood">·</span><span>{t}</span></li>)}
              </ul>
            </Card>
            <Card topAccent="fire">
              <h3 className="text-[15px] font-semibold" style={{ color: "var(--color-fire)" }}>{behavior ? "今日忌" : "避祸 · 忌"}</h3>
              <ul className="mt-2 space-y-1.5 text-[14px] text-ink-2">
                {(behavior?.dont ?? fortune.caution).map((t, i) => <li key={i} className="flex gap-1.5"><span className="text-fire">·</span><span>{t}</span></li>)}
              </ul>
            </Card>
          </div>

          {fortune.almanacYi.length + fortune.almanacJi.length > 0 && (
            <Card>
              <div className="text-[12px] text-muted">黄历</div>
              <div className="mt-1 text-[13px] text-ink-2"><span className="text-wood">宜</span> {fortune.almanacYi.join("、") || "—"}</div>
              <div className="mt-0.5 text-[13px] text-ink-2"><span className="text-fire">忌</span> {fortune.almanacJi.join("、") || "—"}</div>
            </Card>
          )}
        </div>
      )}

      <p className="mt-8 text-[12px] leading-relaxed text-muted">
        每日运势为流日命理的启发性参照，非吉凶预言。请结合现实理性判断。
      </p>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
