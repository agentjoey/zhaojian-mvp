"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { computeChartAction, geocodeAction, type GeoResult } from "@/app/actions";
import { createProfile } from "@/lib/profiles";
import { hasTgSession, isTelegram, ensureTgSession, tgReadyExpand } from "@/lib/tg/client";
import { useTgMainButton, haptics } from "@/lib/tg/ui";
import { useT } from "@/lib/i18n/I18nProvider";
import type { BirthInput } from "@eamvp/core";

const field = "w-full px-3 py-2.5 text-[14px] text-ink outline-none transition-colors";
const fieldStyle: React.CSSProperties = { background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: "var(--radius-button)", boxShadow: "var(--shadow-card)" };

const SHICHEN = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
function shichenOf(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  if (Number.isNaN(h)) return "";
  const idx = h === 23 ? 0 : Math.floor((h + 1) / 2) % 12;
  return `${SHICHEN[idx]}时`;
}

export function ReadingForm() {
  const router = useRouter();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // 受控字段（用于派生 canSubmit 与 TG MainButton）
  const [date, setDate] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");

  // 出生时辰
  const [time, setTime] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);

  // 避免 SSR/ hydration 因 isTelegram() 不一致而错位
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const inTg = mounted && isTelegram();

  useEffect(() => {
    if (isTelegram()) tgReadyExpand();
  }, []);

  // 出生地（地名 → 经纬度/时区）
  const [placeQuery, setPlaceQuery] = useState("");
  const [geo, setGeo] = useState<GeoResult | null>(null);
  const [candidates, setCandidates] = useState<GeoResult[]>([]);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geocoding, startGeocode] = useTransition();

  const canSubmit = Boolean(date && gender && geo);

  useTgMainButton({
    text: t("reading.castMyChart"),
    onClick: () => formRef.current?.requestSubmit(),
    enabled: canSubmit,
    visible: inTg,
  });

  function doGeocode() {
    setGeoError(null);
    setCandidates([]);
    startGeocode(async () => {
      const r = await geocodeAction(placeQuery);
      if (!r.ok) { setGeoError(r.error); haptics.error(); return; }
      if (r.results.length === 1) setGeo(r.results[0]!);
      else setCandidates(r.results);
    });
  }

  function onSubmit(formData: FormData) {
    haptics.light();
    setError(null);
    const nickname = formData.get("nickname") ? String(formData.get("nickname")) : undefined;
    const input: Partial<BirthInput> = {
      date: String(formData.get("date") ?? ""),
      time: timeUnknown || !time ? null : time,
      gender: String(formData.get("gender") ?? "") as BirthInput["gender"],
      isLunar: formData.get("isLunar") === "on",
      latitude: geo?.lat,
      longitude: geo?.lon,
      timezone: geo?.timezone,
      nickname,
    };
    startTransition(async () => {
      if (hasTgSession()) {
        try {
          await ensureTgSession();
          const r = await fetch("/api/tg/profile", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ nickname, birthInput: input }),
          });
          if (!r.ok) { setError(await r.text()); haptics.error(); return; }
          router.push("/chart");
        } catch (e) {
          setError(t("reading.saveProfileError", { message: e instanceof Error ? e.message : String(e) }));
          haptics.error();
        }
        return;
      }
      const res = await computeChartAction(input);
      if (!res.ok) { setError(res.error); haptics.error(); return; }
      try {
        await createProfile({ nickname, birthInput: input as BirthInput, chart: res.chart });
        router.push("/chart");
      } catch (e) {
        setError(t("reading.saveChartError", { message: e instanceof Error ? e.message : String(e) }));
        haptics.error();
      }
    });
  }

  const join = t("common.listSeparator");

  return (
    <form ref={formRef} action={onSubmit} className="space-y-5">
      <Field label={t("reading.nicknameLabel")}>
        <input name="nickname" className={`${field} placeholder:text-muted`} style={fieldStyle} placeholder={t("reading.nicknamePlaceholder")} />
      </Field>

      <Field label={t("reading.birthDateLabel")}>
        <input name="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={`${field} placeholder:text-muted`} style={fieldStyle} />
        <label className="mt-2 flex items-center gap-2 text-[12px] text-ink-2">
          <input name="isLunar" type="checkbox" className="accent-[var(--color-cinnabar)]" /> {t("reading.lunarCheckbox")}
        </label>
      </Field>

      {/* 出生时辰 */}
      <Field label={t("reading.birthTimeLabel")}>
        <div className="flex items-center gap-3">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={timeUnknown}
            className={`${field} placeholder:text-muted`}
            style={{ ...fieldStyle, opacity: timeUnknown ? 0.5 : 1 }}
          />
          {time && !timeUnknown && (
            <span className="shrink-0 text-[13px] text-gold">{shichenOf(time)}</span>
          )}
        </div>
        <label className="mt-2 flex items-center gap-2 text-[12px] text-ink-2">
          <input type="checkbox" checked={timeUnknown} onChange={(e) => setTimeUnknown(e.target.checked)} className="accent-[var(--color-cinnabar)]" />
          {t("reading.timeUnknownLabel")}
        </label>
        <p className="mt-1 text-[11px] text-muted">
          {timeUnknown ? t("reading.timeUnknownHint") : t("reading.timeKnownHint")}
        </p>
      </Field>

      {/* 出生地 */}
      <Field label={t("reading.birthplaceLabel")}>
        {geo ? (
          <div className="flex items-start justify-between gap-3 px-3 py-2.5" style={fieldStyle}>
            <div className="text-[13px]">
              <div className="text-ink">{geo.label.split(",").slice(0, 3).join(join)}</div>
              <div className="latin-label mt-0.5 text-[10px] text-muted">{t("reading.geoCoords", { lon: geo.lon, lat: geo.lat, timezone: geo.timezone })}</div>
            </div>
            <button type="button" onClick={() => { setGeo(null); setCandidates([]); }} className="shrink-0 text-[12px] text-cinnabar">{t("reading.reselect")}</button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doGeocode(); } }}
                className={`${field} placeholder:text-muted`}
                style={fieldStyle}
                placeholder={t("reading.birthplacePlaceholder")}
              />
              <button type="button" onClick={doGeocode} disabled={geocoding} className="shrink-0 px-4 text-[14px] disabled:opacity-50" style={{ background: "var(--color-tint)", color: "var(--color-ink)", border: "1px solid var(--color-line)", borderRadius: "var(--radius-button)" }}>
                {geocoding ? t("reading.searching") : t("reading.search")}
              </button>
            </div>
            {geoError && <p className="mt-1.5 text-[12px] text-seal">{geoError}</p>}
            {candidates.length > 0 && (
              <ul className="mt-2 space-y-2">
                {candidates.map((c, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => { setGeo(c); setCandidates([]); }}
                      className="block w-full rounded-[var(--radius-button)] px-3 py-2.5 text-left text-[13px] text-ink bg-surface border border-line transition-colors hover:bg-tint"
                    >
                      {c.label.split(",").slice(0, 4).join(join)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-[11px] text-muted">{t("reading.noBirthplaceHint")}</p>
          </>
        )}
      </Field>

      <Field label={t("reading.genderLabel")}>
        <div className="flex gap-2">
          {(
            [
              { value: "male", label: t("reading.male") },
              { value: "female", label: t("reading.female") },
            ] as const
          ).map((opt) => {
            const selected = gender === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGender(opt.value)}
                className="flex-1 px-3 py-2.5 text-[14px] font-medium rounded-[var(--radius-button)] transition-colors"
                style={{
                  background: selected ? "var(--color-cinnabar)" : "var(--color-tint)",
                  color: selected ? "#fff" : "var(--color-ink)",
                  border: selected ? "none" : "1px solid var(--color-line)",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <input type="hidden" name="gender" value={gender} />
      </Field>

      {!inTg && (
        <button type="submit" disabled={pending} className="w-full px-6 py-[15px] text-[16px] font-medium text-white transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50" style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)", boxShadow: "var(--shadow-btn)" }}>
          {pending ? t("reading.submitting") : t("reading.submit")}
        </button>
      )}

      {error && (
        <div className="px-4 py-3 text-[13px]" style={{ borderRadius: "var(--radius-card)", background: "var(--color-error-bg)", color: "var(--color-seal)", border: "1px solid var(--color-error-line)" }}>{error}</div>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] text-muted">{label}</label>
      {children}
    </div>
  );
}
