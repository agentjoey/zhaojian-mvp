"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveProfile, getQuestionnaire, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile, tgGetQuestionnaire } from "@/lib/tg/client";
import type { QuestionnaireAnswers } from "@eamvp/core";
import { SpiritPanel } from "@/app/chart/SpiritPanel";
import { Questionnaire } from "@/app/chart/Questionnaire";
import { SelfPortrait } from "@/app/chart/SelfPortrait";
import { useT } from "@/lib/i18n/I18nProvider";

const ENABLED = process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1";

export default function SpiritPage() {
  const t = useT();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [qAnswers, setQAnswers] = useState<QuestionnaireAnswers | null | undefined>(undefined);

  useEffect(() => {
    if (!ENABLED) return;
    // TG 内走后端中介(service_role)取档；web 走 Supabase RLS
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
      <Centered>
        <p className="text-muted">{t("spirit.notEnabled")}</p>
      </Centered>
    );
  }

  if (profile === undefined) return <Centered>{t("spirit.loadingProfile")}</Centered>;

  if (profile === null) {
    return (
      <Centered>
        <p className="text-ink-2">{t("spirit.noProfile")}</p>
        <Link
          href="/reading"
          className="mt-4 inline-block px-6 py-3 text-on-ink"
          style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}
        >
          {t("spirit.goCast")}
        </Link>
      </Centered>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
      <header className="mb-8">
        <h1 className="font-serif text-[28px] font-black">{t("spirit.title")}</h1>
        <p className="mt-1 text-[13px] text-muted">
          {t("spirit.subtitle")}
        </p>
      </header>

      {qAnswers === null && <Questionnaire profile={profile} onDone={setQAnswers} />}
      {qAnswers && <SelfPortrait chart={profile.chart} questionnaire={qAnswers} />}
      <SpiritPanel profile={profile} />

      <p className="mt-10 text-[12px] leading-relaxed text-muted">
        {t("spirit.disclaimer")}
      </p>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
