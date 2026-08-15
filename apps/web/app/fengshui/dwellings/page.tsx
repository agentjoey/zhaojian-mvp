"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DIRECTION_LABEL } from "@eamvp/core";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { useT } from "@/lib/i18n/I18nProvider";
import { listDwellings, deleteDwelling, type Dwelling } from "@/lib/dwellings";
import { Card } from "@/components/ui";
import { DwellingForm } from "../DwellingForm";

const ENABLED = process.env.NEXT_PUBLIC_FENGSHUI_ENABLED === "1";

/**
 * 居所管理页（EP-fs-14）。与「境」系列页面同一套骨架约定（见 ../object/page.tsx）：
 * flag 门控 → 档案读取（Telegram 会话优先，否则匿名档案）→ 内容。居所记录本身按
 * 会话存取、不绑定某个具体档案（见 lib/dwellings.ts），但方位判断的意义依附于命盘——
 * 沿用同一骨架，没有档案时同样先引导去起盘，而不是允许在没有命盘的情况下裸录朝向。
 */
export default function DwellingsPage() {
  const t = useT();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [dwellings, setDwellings] = useState<Dwelling[] | null>(null);

  useEffect(() => {
    if (!ENABLED) return;
    (hasTgSession() ? tgGetProfile() : getActiveProfile())
      .then((p: Profile | null) => setProfile(p))
      .catch(() => setProfile(null));
  }, []);

  useEffect(() => {
    if (!ENABLED || !profile) return;
    listDwellings()
      .then(setDwellings)
      .catch(() => setDwellings([]));
  }, [profile]);

  function handleSaved(saved: Dwelling) {
    setDwellings((prev) => {
      if (!prev) return [saved];
      const idx = prev.findIndex((d) => d.id === saved.id);
      if (idx === -1) return [...prev, saved];
      const next = [...prev];
      next[idx] = saved;
      return next;
    });
  }

  async function handleDelete(id: string) {
    if (!confirm(t("fengshui.dwelling.deleteConfirm"))) return;
    await deleteDwelling(id);
    setDwellings((prev) => (prev ? prev.filter((d) => d.id !== id) : prev));
  }

  if (!ENABLED) return <Centered>{t("fengshui.notEnabled")}</Centered>;
  if (profile === undefined) return <Centered>{t("fengshui.loadingProfile")}</Centered>;
  if (profile === null) {
    return (
      <Centered>
        <p className="text-ink-2">{t("fengshui.noProfile")}</p>
        <Link href="/reading" className="mt-4 text-[14px]" style={{ color: "var(--color-cinnabar)" }}>
          {t("fengshui.goCast")}
        </Link>
      </Centered>
    );
  }

  return (
    <main className="mx-auto max-w-[720px] px-4 pb-8 pt-6">
      <Link href="/fengshui" className="text-[13px] text-ink-2">← {t("fengshui.title")}</Link>
      <h1 className="mt-3 text-[22px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.dwelling.title")}</h1>

      <section className="mt-6">
        {dwellings === null ? (
          <p className="text-[13px] text-muted">{t("common.loading")}</p>
        ) : dwellings.length === 0 ? (
          <p className="text-[13px] text-muted">{t("fengshui.dwelling.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {dwellings.map((d) => (
              <Card key={d.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] text-ink">{d.name}</p>
                    <p className="mt-1 text-[13px] text-ink-2">
                      {d.kind === "home" ? t("fengshui.dwelling.kindHome") : t("fengshui.dwelling.kindOffice")}
                      {" · "}
                      {d.tenancy === "rent" ? t("fengshui.dwelling.tenancyRent") : t("fengshui.dwelling.tenancyOwn")}
                      {" · "}
                      {d.facing ? DIRECTION_LABEL[d.facing] : t("fengshui.dwelling.facingUnknown")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(d.id)}
                    className="text-[13px]"
                    style={{ color: "var(--color-cinnabar)" }}
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-[16px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.dwelling.add")}</h2>
        <div className="mt-3">
          <DwellingForm onSaved={handleSaved} />
        </div>
      </section>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
