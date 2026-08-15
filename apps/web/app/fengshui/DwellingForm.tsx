"use client";

import { useEffect, useState } from "react";
import { DIRECTIONS, DIRECTION_LABEL, type Direction } from "@eamvp/core";
import { createDwelling, updateDwelling, type Dwelling } from "@/lib/dwellings";
import { listProfiles, getActiveProfileId, type Profile } from "@/lib/profiles";
import { useT } from "@/lib/i18n/I18nProvider";
import { Button } from "@/components/ui";

/**
 * 居所录入（EP-fs-14）。
 * ⚠️ 朝向是本表单唯一容易出错的输入：「向」指大门**朝外**的方向，
 * 相当比例的用户会理解反。三重应对：图形化按钮（非下拉）、明确提示语、
 * 以及「不确定」选项 —— 宁可降级回 Layer 0，也不要一份方向性错误的报告。
 */
export function DwellingForm({ initial, onSaved }: { initial?: Dwelling; onSaved: (d: Dwelling) => void }) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<"home" | "office">(initial?.kind ?? "home");
  const [tenancy, setTenancy] = useState<"rent" | "own">(initial?.tenancy ?? "rent");
  const [facing, setFacing] = useState<Direction | null>(initial?.facing ?? null);
  const [touchedFacing, setTouchedFacing] = useState(initial != null);
  const [saving, setSaving] = useState(false);

  // 同住人候选（Task 9b/EP-fs-13/14）：所有档案里排除当前活跃档案自己——他是「我」，
  // 不是「同住人」。memberIds 用 initial?.memberProfileIds 回显，否则编辑一次会静默清空。
  const [candidates, setCandidates] = useState<Profile[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>(initial?.memberProfileIds ?? []);

  useEffect(() => {
    let cancelled = false;
    listProfiles()
      .then((list) => {
        if (cancelled) return;
        const activeId = getActiveProfileId();
        setCandidates(list.filter((p) => p.id !== activeId));
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleMember(id: string) {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        name: name.trim() || t("fengshui.dwelling.namePlaceholder"),
        kind, tenancy, facing, memberProfileIds: memberIds,
      };
      const saved = initial
        ? (await updateDwelling(initial.id, payload), { ...initial, ...payload })
        : await createDwelling(payload);
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-[13px] text-ink-2">
        {t("fengshui.dwelling.nameLabel")}
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder={t("fengshui.dwelling.namePlaceholder")} className="w-full" />
      </label>

      <Segmented value={kind} onChange={setKind}
        options={[["home", t("fengshui.dwelling.kindHome")], ["office", t("fengshui.dwelling.kindOffice")]]} />
      <Segmented value={tenancy} onChange={setTenancy}
        options={[["rent", t("fengshui.dwelling.tenancyRent")], ["own", t("fengshui.dwelling.tenancyOwn")]]} />

      <div>
        <p className="text-[13px] text-ink-2">{t("fengshui.dwelling.facingLabel")}</p>
        <p className="mt-1 text-[12px] text-muted">{t("fengshui.dwelling.facingHint")}</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {DIRECTIONS.map((d) => (
            <button key={d} type="button"
              onClick={() => { setFacing(d); setTouchedFacing(true); }}
              className="rounded-[var(--radius-button)] border px-2 py-2 text-[14px]"
              style={{
                borderColor: facing === d ? "var(--color-cinnabar)" : "var(--color-line)",
                color: facing === d ? "var(--color-cinnabar)" : "var(--color-ink)",
              }}>
              {DIRECTION_LABEL[d]}
            </button>
          ))}
          <button type="button"
            onClick={() => { setFacing(null); setTouchedFacing(true); }}
            className="col-span-4 rounded-[var(--radius-button)] border px-2 py-2 text-[13px]"
            style={{
              borderColor: touchedFacing && facing === null ? "var(--color-cinnabar)" : "var(--color-line)",
              color: touchedFacing && facing === null ? "var(--color-cinnabar)" : "var(--color-muted)",
            }}>
            {t("fengshui.dwelling.facingUnknown")}
          </button>
        </div>
      </div>

      {candidates.length > 0 && (
        <div>
          <p className="text-[13px] text-ink-2">{t("fengshui.dwelling.membersLabel")}</p>
          <p className="mt-1 text-[12px] text-muted">{t("fengshui.dwelling.membersHint")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {candidates.map((p) => (
              <button key={p.id} type="button"
                onClick={() => toggleMember(p.id)}
                className="rounded-[var(--radius-button)] border px-3 py-1.5 text-[13px]"
                style={{
                  borderColor: memberIds.includes(p.id) ? "var(--color-cinnabar)" : "var(--color-line)",
                  color: memberIds.includes(p.id) ? "var(--color-cinnabar)" : "var(--color-ink)",
                }}>
                {p.nickname}
              </button>
            ))}
          </div>
        </div>
      )}

      <Button onClick={save} disabled={saving || !touchedFacing}>
        {saving ? t("fengshui.dwelling.saving") : t("fengshui.dwelling.save")}
      </Button>
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: [T, string][];
}) {
  return (
    <div className="flex gap-2">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className="flex-1 rounded-[var(--radius-button)] border py-2 text-[14px]"
          style={{
            borderColor: value === v ? "var(--color-cinnabar)" : "var(--color-line)",
            color: value === v ? "var(--color-cinnabar)" : "var(--color-ink)",
          }}>
          {label}
        </button>
      ))}
    </div>
  );
}
