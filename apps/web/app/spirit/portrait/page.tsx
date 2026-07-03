"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getActiveProfile, getQuestionnaire, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile, tgGetQuestionnaire } from "@/lib/tg/client";
import type { QuestionnaireAnswers } from "@eamvp/core";
import { SelfPortrait } from "@/app/chart/SelfPortrait";
import { useT } from "@/lib/i18n/I18nProvider";

const ENABLED = process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1";

export default function SpiritPortraitPage() {
  const t = useT();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [qAnswers, setQAnswers] = useState<QuestionnaireAnswers | null | undefined>(undefined);

  useEffect(() => {
    if (!ENABLED) return;
    (hasTgSession() ? tgGetProfile() : getActiveProfile())
      .then((p: Profile | null) => {
        setProfile(p);
        if (p) {
          (hasTgSession() ? tgGetQuestionnaire() : getQuestionnaire(p.id))
            .then((q) => setQAnswers((q as QuestionnaireAnswers | null) ?? null))
            .catch(() => setQAnswers(null));
        }
      })
      .catch(() => setProfile(null));
  }, []);

  if (!ENABLED) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <p className="text-muted">{t("spirit.notEnabled")}</p>
      </main>
    );
  }

  if (profile === undefined) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <p className="text-muted">{t("spirit.loadingProfile")}</p>
      </main>
    );
  }

  if (profile === null) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <p className="text-ink-2">{t("spirit.noProfile")}</p>
        <Link
          href="/reading"
          className="mt-4 inline-block px-6 py-3 text-on-ink"
          style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}
        >
          {t("spirit.goCast")}
        </Link>
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex h-[56px] items-center justify-between border-b border-[var(--color-line)] bg-surface px-4">
        <h1 className="font-serif text-[18px] font-bold text-ink">{t("spirit.portraitPageTitle")}</h1>
        <button
          type="button"
          className="rounded-[var(--radius-chip)] bg-paper px-3 py-1.5 text-[12px] text-ink-2"
          onClick={() => {
            if (navigator.share) {
              void navigator.share({ title: t("spirit.portraitPageTitle"), url: window.location.href });
            }
          }}
        >
          {t("spirit.share")}
        </button>
      </header>
      <SelfPortrait
        chart={profile.chart}
        questionnaire={qAnswers ?? undefined}
        fullPage
        onTalk={() => {
          router.push("/spirit?topic=portrait");
        }}
      />
    </>
  );
}
