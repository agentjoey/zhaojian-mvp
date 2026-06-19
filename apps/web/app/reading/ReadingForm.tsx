"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computeChartAction } from "@/app/actions";
import { createProfile } from "@/lib/profiles";
import type { BirthInput } from "@eamvp/core";

const field = "w-full px-3 py-2.5 text-[14px] text-ink outline-none transition-colors";
const fieldStyle: React.CSSProperties = {
  background: "var(--color-float)",
  border: "1px solid #DBD4C3",
  borderRadius: "var(--radius-button)",
};

export function ReadingForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    const nickname = formData.get("nickname") ? String(formData.get("nickname")) : undefined;
    const input = {
      date: String(formData.get("date") ?? ""),
      time: formData.get("time") ? String(formData.get("time")) : null,
      gender: String(formData.get("gender") ?? "") as BirthInput["gender"],
      isLunar: formData.get("isLunar") === "on",
      longitude: formData.get("longitude") ? Number(formData.get("longitude")) : undefined,
      latitude: formData.get("latitude") ? Number(formData.get("latitude")) : undefined,
      nickname,
    };
    startTransition(async () => {
      const res = await computeChartAction(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // 建档：命盘一次生成、冻结存档（EP-007 / Supabase）
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

      <div className="grid grid-cols-2 gap-4">
        <Field label="出生日期">
          <input name="date" type="date" required className={field} style={fieldStyle} />
        </Field>
        <Field label="出生时辰（选填）">
          <input name="time" type="time" className={field} style={fieldStyle} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="出生地纬度">
          <input name="latitude" type="number" step="any" className={field} style={fieldStyle} placeholder="如 31.23" />
        </Field>
        <Field label="出生地经度">
          <input name="longitude" type="number" step="any" className={field} style={fieldStyle} placeholder="如 121.47" />
        </Field>
      </div>

      <div className="flex items-end justify-between gap-4">
        <Field label="性别" className="flex-1">
          <select name="gender" required className={field} style={fieldStyle}>
            <option value="">请选择…</option>
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 pb-3 text-[13px] text-ink-2">
          <input name="isLunar" type="checkbox" className="accent-[var(--color-cinnabar)]" /> 农历
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full px-6 py-3 text-[15px] text-on-ink transition-all duration-200 hover:bg-cinnabar-press disabled:opacity-50"
        style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}
      >
        {pending ? "正在为你起盘…" : "为我起盘"}
      </button>

      {error && (
        <div className="px-4 py-3 text-[13px]" style={{ borderRadius: "var(--radius-card)", background: "#FBEEEC", color: "var(--color-seal)", border: "1px solid #EFD6D2" }}>
          {error}
        </div>
      )}
    </form>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[12px] text-muted">{label}</label>
      {children}
    </div>
  );
}
