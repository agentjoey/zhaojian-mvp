"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { dailyFortuneAction, dailyPolishAction } from "@/app/actions";
import { Card } from "@/components/ui";
import type { DailyFortune } from "@eamvp/core";

// 轻润色按 (档案,日期) 缓存到 localStorage，避免重复调 LLM
function polishCacheGet(pid: string, date: string): string | null {
  try { return localStorage.getItem(`zhaojian.polish.${pid}.${date}`); } catch { return null; }
}
function polishCacheSet(pid: string, date: string, v: string): void {
  try { localStorage.setItem(`zhaojian.polish.${pid}.${date}`, v); } catch { /* ignore */ }
}

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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getActiveProfile().then(setProfile).catch(() => setProfile(null));
  }, []);

  useEffect(() => {
    const p = profile;
    if (!p) return;
    let alive = true;
    setLoading(true);
    setPolish(polishCacheGet(p.id, selected)); // 命中缓存先显示
    dailyFortuneAction({ bazi: p.chart.bazi }, selected)
      .then((f) => {
        if (!alive) return;
        setFortune(f);
        // 轻润色：缓存未命中才调 LLM
        if (!polishCacheGet(p.id, selected)) {
          dailyPolishAction(f, p.nickname).then((line) => {
            if (alive && line) { setPolish(line); polishCacheSet(p.id, selected, line); }
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
      <header className="mb-6">
        <h1 className="text-[26px] font-semibold">运势日历</h1>
        <p className="mt-1 text-[13px] text-muted">{profile.nickname} · 命主 {profile.chart.bazi.dayMaster}（{profile.chart.bazi.dayMasterElement}）</p>
      </header>

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
        <div className="space-y-5">
          {/* 总览 */}
          <Card dark>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[13px] text-on-ink-muted">{fortune.date} · 农历{fortune.lunarDate}</div>
                <div className="mt-1 text-[20px] font-semibold">{fortune.dayGanZhi} 日 <span className="text-on-ink-gold text-[14px]">（{fortune.dayElement}）· {fortune.relation}</span></div>
              </div>
              <div className="text-right">
                <div className="font-latin text-[40px] leading-none text-on-ink">{fortune.scores.overall}</div>
                <div className="text-[11px] text-on-ink-faint">综合 / 10</div>
              </div>
            </div>
            <p className="mt-3 text-[14px] leading-[1.8] text-on-ink-muted">{fortune.tone}</p>
            {polish && (
              <p className="mt-2 flex items-start gap-2 text-[14px] leading-[1.7]" style={{ color: "var(--color-on-ink-gold)" }}>
                <span aria-hidden>✦</span><span>{polish}</span>
              </p>
            )}
          </Card>

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

          {/* 趋吉 / 避祸 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card topAccent="wood">
              <h3 className="text-[15px] font-semibold" style={{ color: "var(--color-wood)" }}>趋吉 · 宜</h3>
              <ul className="mt-2 space-y-1.5 text-[14px] text-ink-2">
                {fortune.auspicious.map((t, i) => <li key={i}>· {t}</li>)}
              </ul>
            </Card>
            <Card topAccent="fire">
              <h3 className="text-[15px] font-semibold" style={{ color: "var(--color-fire)" }}>避祸 · 忌</h3>
              <ul className="mt-2 space-y-1.5 text-[14px] text-ink-2">
                {fortune.caution.map((t, i) => <li key={i}>· {t}</li>)}
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
