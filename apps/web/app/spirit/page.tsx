"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveProfile, getQuestionnaire, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile, tgGetQuestionnaire } from "@/lib/tg/client";
import type { QuestionnaireAnswers } from "@eamvp/core";
import { SpiritPanel } from "@/app/chart/SpiritPanel";
import { Questionnaire } from "@/app/chart/Questionnaire";
import { useT } from "@/lib/i18n/I18nProvider";

const ENABLED = process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1";

export default function SpiritPage() {
  const t = useT();
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
    <main className="flex h-[100dvh] flex-col">
      <header className="flex h-[56px] shrink-0 items-center justify-between border-b border-[var(--color-line)] bg-surface px-4">
        <Link href="/chart" className="flex items-center gap-1 text-[14px] text-ink-2">
          <span>←</span>
          <span>{t("common.back")}</span>
        </Link>
        <Link
          href="/spirit/portrait"
          className="text-[13px] text-cinnabar"
        >
          {t("spirit.viewPortrait")}
        </Link>
      </header>
      {qAnswers === null && (
        <div className="px-4 pt-4">
          <Questionnaire profile={profile} onDone={setQAnswers} />
        </div>
      )}
      <SpiritPanel profile={profile} />
      <p className="px-5 pb-2 pt-1 text-[11px] leading-relaxed text-muted">{t("spirit.disclaimer")}</p>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
