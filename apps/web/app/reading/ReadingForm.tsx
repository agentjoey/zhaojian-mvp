"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { computeChartAction, geocodeAction, type GeoResult } from "@/app/actions";
import { createProfile } from "@/lib/profiles";
import { isTelegram, ensureTgSession, tgReadyExpand } from "@/lib/tg/client";
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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (isTelegram()) tgReadyExpand();
  }, []);

  // 出生地（地名 → 经纬度/时区）
  const [placeQuery, setPlaceQuery] = useState("");
  const [geo, setGeo] = useState<GeoResult | null>(null);
  const [candidates, setCandidates] = useState<GeoResult[]>([]);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geocoding, startGeocode] = useTransition();

  // 出生时辰
  const [time, setTime] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);

  function doGeocode() {
    setGeoError(null);
    setCandidates([]);
    startGeocode(async () => {
      const r = await geocodeAction(placeQuery);
      if (!r.ok) { setGeoError(r.error); return; }
      if (r.results.length === 1) setGeo(r.results[0]!);
      else setCandidates(r.results);
    });
  }

  function onSubmit(formData: FormData) {
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
      if (isTelegram()) {
        try {
          await ensureTgSession();
          const r = await fetch("/api/tg/profile", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ nickname, birthInput: input }),
          });
          if (!r.ok) { setError(await r.text()); return; }
          router.push("/chart");
        } catch (e) {
          setError(`建档失败：${e instanceof Error ? e.message : String(e)}`);
        }
        return;
      }
      const res = await computeChartAction(input);
      if (!res.ok) { setError(res.error); return; }
      try {
        await createProfile({ nickname, birthInput: input as BirthInput, chart: res.chart });
        router.push("/chart");
      } catch (e) {
        setError(`存档失败：${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-5">
      <Field label="称呼（选填）">
        <input name="nickname" className={field} style={fieldStyle} placeholder="希望我如何称呼你？" />
      </Field>

      <Field label="出生日期">
        <input name="date" type="date" required className={field} style={fieldStyle} />
        <label className="mt-2 flex items-center gap-2 text-[12px] text-ink-2">
          <input name="isLunar" type="checkbox" className="accent-[var(--color-cinnabar)]" /> 我填的是农历
        </label>
      </Field>

      {/* 出生时辰 */}
      <Field label="出生时辰">
        <div className="flex items-center gap-3">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={timeUnknown}
            className={field}
            style={{ ...fieldStyle, opacity: timeUnknown ? 0.5 : 1 }}
          />
          {time && !timeUnknown && (
            <span className="shrink-0 text-[13px] text-gold">{shichenOf(time)}</span>
          )}
        </div>
        <label className="mt-2 flex items-center gap-2 text-[12px] text-ink-2">
          <input type="checkbox" checked={timeUnknown} onChange={(e) => setTimeUnknown(e.target.checked)} className="accent-[var(--color-cinnabar)]" />
          不知道出生时辰
        </label>
        <p className="mt-1 text-[11px] text-muted">
          {timeUnknown ? "将略去西方星盘与心理映照层，仅呈现命理。" : "时辰决定时柱与上升星座，越准越好。"}
        </p>
      </Field>

      {/* 出生地 */}
      <Field label="出生地（用于校正真太阳时与西方星盘）">
        {geo ? (
          <div className="flex items-start justify-between gap-3 px-3 py-2.5" style={fieldStyle}>
            <div className="text-[13px]">
              <div className="text-ink">{geo.label.split(",").slice(0, 3).join("、")}</div>
              <div className="latin-label mt-0.5 text-[10px] text-muted">经 {geo.lon}° · 纬 {geo.lat}° · {geo.timezone}</div>
            </div>
            <button type="button" onClick={() => { setGeo(null); setCandidates([]); }} className="shrink-0 text-[12px] text-cinnabar">重选</button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doGeocode(); } }}
                className={field}
                style={fieldStyle}
                placeholder="输入城市/地名，如 上海、北京朝阳、New York"
              />
              <button type="button" onClick={doGeocode} disabled={geocoding} className="shrink-0 px-4 text-[14px] text-on-ink disabled:opacity-50" style={{ background: "var(--color-ink)", borderRadius: "var(--radius-button)" }}>
                {geocoding ? "查找…" : "查找"}
              </button>
            </div>
            {geoError && <p className="mt-1.5 text-[12px] text-seal">{geoError}</p>}
            {candidates.length > 0 && (
              <ul className="mt-2 overflow-hidden" style={{ border: "1px solid var(--color-line)", borderRadius: "var(--radius-card)" }}>
                {candidates.map((c, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => { setGeo(c); setCandidates([]); }} className="block w-full px-3 py-2 text-left text-[13px] text-ink-2 hover:bg-tint" style={{ borderTop: i ? "1px solid var(--color-line)" : undefined }}>
                      {c.label.split(",").slice(0, 4).join("、")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-[11px] text-muted">不填出生地则不做真太阳时校正、并略去西方星盘。</p>
          </>
        )}
      </Field>

      <Field label="性别">
        <select name="gender" required className={field} style={fieldStyle}>
          <option value="">请选择…</option>
          <option value="male">男</option>
          <option value="female">女</option>
        </select>
      </Field>

      <button type="submit" disabled={pending} className="w-full px-6 py-[15px] text-[16px] font-medium text-white transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50" style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)", boxShadow: "var(--shadow-btn)" }}>
        {pending ? "正在为你起盘…" : "为我起盘 · 即时生成"}
      </button>

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
