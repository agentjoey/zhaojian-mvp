"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { dailyFortuneAction, dailyPolishAction, dailyBehaviorAction, ziweiHoroscopeAction } from "@/app/actions";
import { matchFortuneImage, MOOD_LABEL } from "@/lib/fortune-images";
import { GanzhiBadge } from "@/components/ui";
import { ScoreRing } from "@/components/ScoreRing";
import { CastingOverlay } from "@/components/CastingOverlay";
import { FortuneFrame } from "@/components/FortuneFrame";
import { PageHeader } from "@/components/PageHeader";
import { AskToday } from "./AskToday";
import { useT } from "@/lib/i18n/I18nProvider";
import type { DailyFortune, ZiweiHoroscope } from "@eamvp/core";

// 按 (档案,日期,kind) 缓存 LLM 结果到 localStorage，避免重复调用
function cacheGet(kind: string, pid: string, date: string): string | null {
  try { return localStorage.getItem(`zhaojian.${kind}.${pid}.${date}`); } catch { return null; }
}
function cacheSet(kind: string, pid: string, date: string, v: string): void {
  try { localStorage.setItem(`zhaojian.${kind}.${pid}.${date}`, v); } catch { /* ignore */ }
}

// 综合分 → 大字总评（返回 i18n key）
function gradeOf(overall: number): "auspicious" | "smooth" | "neutral" | "cautious" {
  if (overall >= 8) return "auspicious";
  if (overall >= 6) return "smooth";
  if (overall >= 4) return "neutral";
  return "cautious";
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
const DIMS: ("career" | "wealth" | "love" | "health" | "travel")[] = [
  "career", "wealth", "love", "health", "travel",
];

export default function CalendarPage() {
  const t = useT();
  const WK = t("calendar.weekDays").split(",");
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [today] = useState(() => new Date());
  const [selected, setSelected] = useState(() => ymd(new Date()));
  const [fortune, setFortune] = useState<DailyFortune | null>(null);
  const [polish, setPolish] = useState<string | null>(null);
  const [behavior, setBehavior] = useState<Behavior | null>(null);
  const [horoscope, setHoroscope] = useState<ZiweiHoroscope | null>(null);
  const [loading, setLoading] = useState(false);
  const [casting, setCasting] = useState(false); // 进入运势的品牌化过场（每会话一次）
  const [dark, setDark] = useState(false);
  const [fortuneImgError, setFortuneImgError] = useState(false);
  const selYear = selected.slice(0, 4);

  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.getAttribute("data-tg-theme") === "dark");
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["data-tg-theme"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const p = hasTgSession() ? await tgGetProfile() : await getActiveProfile();
        setProfile(p);
      } catch {
        setProfile(null);
      }
    })();
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

  if (profile === undefined) return <Centered>{t("calendar.loadingProfile")}</Centered>;
  if (profile === null)
    return (
      <Centered>
        <p className="text-ink-2">{t("calendar.noProfileForFortune")}</p>
        <Link href="/reading" className="mt-4 inline-block px-6 py-3" style={{ background: "var(--color-cinnabar)", color: "var(--color-paper)", borderRadius: "var(--radius-button)" }}>{t("calendar.goCast")}</Link>
      </Centered>
    );

  const days = weekDays(today);

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
      {casting && <CastingOverlay gan={(fortune?.dayGanZhi ?? "庚申")[0]} zhi={(fortune?.dayGanZhi ?? "庚申")[1]} seal="今" title={t("calendar.calculating")} hint={t("common.casting")} />}
      <PageHeader
        kicker={t("calendar.kicker")}
        title={t("calendar.title")}
        annotation={`${profile.nickname} · ${t("calendar.dayMasterLabel")} ${profile.chart.bazi.dayMaster}（${profile.chart.bazi.dayMasterElement}）`}
      />
      <div className="mb-6" />

      {/* 本年/本限 时序上下文（大背景 → 今日） */}
      {horoscope && (
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[var(--radius-card)] px-4 py-3" style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)" }}>
          <span className="text-[13px] text-ink-2">{t("calendar.decadal")} <b className="font-semibold">{horoscope.decadal.stem}{horoscope.decadal.branch}</b></span>
          <span className="text-[13px] text-ink-2">{selYear} {t("calendar.yearly")} <b className="font-semibold">{horoscope.yearly.stem}{horoscope.yearly.branch}</b></span>
          <span className="text-[12px] text-muted">{t("calendar.yearlyJi")} <b className="text-cinnabar">{horoscope.yearly.mutagens.忌}</b>（{t("calendar.thisYearLesson")}）· {t("calendar.yearlyLu")} <b className="text-wood">{horoscope.yearly.mutagens.禄}</b>（{t("calendar.favorable")}）</span>
          <Link href="/chart" className="ml-auto shrink-0 text-[12px] text-gold underline underline-offset-4">{t("calendar.toTimeline")}</Link>
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
        <div className="py-10 text-[14px] text-muted" style={{ borderTop: "1px solid var(--color-line)" }}>{t("calendar.calculating")}</div>
      ) : (
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          {/* 今日日签：判词 + 花窗裱画 + 评分环（纸底仪式，深色 hero 已随 v3 废除） */}
          {(() => {
            const img = matchFortuneImage(fortune.relation, selected);
            const g = gradeOf(fortune.scores.overall);
            const useDarkFile = dark && !!img?.darkFile && !fortuneImgError;
            const imgSrc = useDarkFile ? img.darkFile! : img?.file;
            return (
              <div className="zj-rise lg:col-span-2">
                {/* 主视觉：判词大字当代黄历版（对齐设计稿）。评分环不再是引导视觉——
                    它降级挪到下方「五维」小节当量化佐证，判词才是这张日签的第一眼。
                    判词沿用既有四档（吉/顺/平/谨），未新增老黄历值神/吉时/冲词汇。 */}
                <div className="flex items-start justify-between gap-4">
                  <div className="text-[13px] text-muted">
                    {selected.replaceAll("-", ".")}
                    {fortune.lunarDate ? ` · ${fortune.lunarDate}` : ""}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <GanzhiBadge char={fortune.dayGanZhi[0]!} size={36} />
                    <GanzhiBadge char={fortune.dayGanZhi[1]!} size={36} />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="font-serif text-[64px] font-bold leading-none">{t("calendar.grade." + g)}</div>
                  <div className="mt-2.5 text-[13px]" style={{ color: "var(--color-muted)" }}>
                    {t("calendar.todayVerdict")}
                    <span className="mx-1.5">·</span>
                    {MOOD_LABEL[fortune.relation]}
                  </div>
                </div>
                {img && (
                  <div className="mx-auto mt-8 max-w-[340px]">
                    <FortuneFrame src={imgSrc!} alt={img.alt} seed={selected} />
                    {/* 深色变体 404 兜底探测：display:none 的 img 仍会发请求，但 loading="lazy"
                        在没有布局盒时永不触发——所以这里绝不能加 lazy（C1 评审）。 */}
                    <img src={imgSrc} alt="" aria-hidden className="hidden" onError={() => { if (useDarkFile) setFortuneImgError(true); }} />
                  </div>
                )}
                {polish && (
                  <p className="mx-auto mt-8 max-w-[480px] text-center font-serif text-[16px] leading-[1.9]" style={{ color: "var(--color-ink)" }}>{polish}</p>
                )}
                {(fortune.favorableToday || fortune.interactions.length > 0) && (
                  <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                    {fortune.favorableToday && <span className="px-2.5 py-0.5 text-[11px]" style={{ borderRadius: "var(--radius-chip)", border: "1px solid var(--color-cinnabar)", color: "var(--color-cinnabar)" }}>{t("calendar.favorableToday")}</span>}
                    {fortune.interactions.map((it, i) => (
                      <span key={i} className="px-2.5 py-0.5 text-[11px]" style={{ borderRadius: "var(--radius-chip)", background: "var(--color-tint)", color: "var(--color-muted)" }} title={it.note}>{t("calendar.interaction", { kind: it.kind, withPillar: it.withPillar })}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1" && profile && fortune && (
            <AskToday profile={profile} fortune={fortune} dateStr={selected} />
          )}

          {/* 五维评分（细线计量，去卡片） */}
          <div style={{ borderTop: "1px solid var(--color-line)" }}>
            <div className="flex items-center justify-between pt-5">
              <div className="text-[11px] tracking-[0.3em] text-muted">{t("calendar.dimsTitle")}</div>
              <ScoreRing
                score={fortune.scores.overall}
                max={10}
                size={40}
                accent="var(--color-cinnabar)"
                showLabel={false}
                label={t("calendar.scoreLabel", { grade: t("calendar.grade." + gradeOf(fortune.scores.overall)), today: t("calendar.today") })}
              />
            </div>
            <div className="mt-4 space-y-3">
              {DIMS.map((key) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-8 text-[13px] text-ink">{t("calendar.dims." + key)}</span>
                  <div className="h-[3px] flex-1" style={{ background: "var(--color-line)" }}>
                    <div className="h-full" style={{ width: `${fortune.scores[key] * 10}%`, background: "var(--color-ink)" }} />
                  </div>
                  <span className="font-latin w-5 text-right text-[13px] text-muted">{fortune.scores[key]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 今日宜忌：小方标记 + 细线分行（优先心理行为版，降级确定性趋吉避祸） */}
          <div className="grid gap-8 sm:grid-cols-2" style={{ borderTop: "1px solid var(--color-line)" }}>
            <div className="pt-5">
              <h3 className="flex items-center gap-2 font-serif text-[16px] font-semibold">
                <span className="inline-block h-2 w-2" style={{ background: "var(--color-wood)", borderRadius: 2 }} aria-hidden />
                {behavior ? t("calendar.todayYi") : t("calendar.auspiciousYi")}
              </h3>
              <ul className="mt-3 space-y-2 text-[14px] text-ink-2">
                {(behavior?.do?.length ? behavior.do : fortune.auspicious).map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
            <div className="pt-5">
              <h3 className="flex items-center gap-2 font-serif text-[16px] font-semibold">
                <span className="inline-block h-2 w-2" style={{ background: "var(--color-cinnabar)", borderRadius: 2 }} aria-hidden />
                {behavior ? t("calendar.todayJi") : t("calendar.cautionJi")}
              </h3>
              <ul className="mt-3 space-y-2 text-[14px] text-ink-2">
                {(behavior?.dont?.length ? behavior.dont : fortune.caution).map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          </div>

          {fortune.almanacYi.length + fortune.almanacJi.length > 0 && (
            <div className="pt-5" style={{ borderTop: "1px solid var(--color-line)" }}>
              <div className="text-[11px] tracking-[0.3em] text-muted">{t("calendar.almanac")}</div>
              <div className="mt-3 text-[13px] text-ink-2"><span style={{ color: "var(--color-wood)" }}>{t("calendar.yi")}</span>　{fortune.almanacYi.join("、") || t("calendar.none")}</div>
              <div className="mt-1.5 text-[13px] text-ink-2"><span style={{ color: "var(--color-cinnabar)" }}>{t("calendar.ji")}</span>　{fortune.almanacJi.join("、") || t("calendar.none")}</div>
            </div>
          )}
        </div>
      )}

      <p className="mt-8 text-[12px] leading-relaxed text-muted">
        {t("calendar.disclaimer")}
      </p>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
