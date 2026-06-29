"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveProfile, getQuestionnaire, type Profile } from "@/lib/profiles";
import { isTelegram, tgGetProfile, tgGetQuestionnaire } from "@/lib/tg/client";
import type { QuestionnaireAnswers } from "@eamvp/core";
import { SpiritPanel } from "@/app/chart/SpiritPanel";
import { Questionnaire } from "@/app/chart/Questionnaire";
import { SelfPortrait } from "@/app/chart/SelfPortrait";

const ENABLED = process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1";

export default function SpiritPage() {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [qAnswers, setQAnswers] = useState<QuestionnaireAnswers | null | undefined>(undefined);

  useEffect(() => {
    if (!ENABLED) return;
    // TG 内走后端中介(service_role)取档；web 走 Supabase RLS
    (isTelegram() ? tgGetProfile() : getActiveProfile())
      .then((p: Profile | null) => {
        setProfile(p);
        if (p) {
          (isTelegram() ? tgGetQuestionnaire() : getQuestionnaire(p.id))
            .then((q) => setQAnswers((q as QuestionnaireAnswers | null) ?? null))
            .catch(() => setQAnswers(null));
        }
      })
      .catch(() => setProfile(null));
  }, []);

  if (!ENABLED) {
    return (
      <Centered>
        <p className="text-muted">本命之灵尚未开启。</p>
      </Centered>
    );
  }

  if (profile === undefined) return <Centered>正在读取档案…</Centered>;

  if (profile === null) {
    return (
      <Centered>
        <p className="text-ink-2">尚无命盘档案。</p>
        <Link
          href="/reading"
          className="mt-4 inline-block px-6 py-3 text-on-ink"
          style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}
        >
          去起盘
        </Link>
      </Centered>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
      <header className="mb-8">
        <h1 className="font-serif text-[28px] font-black">本命之灵</h1>
        <p className="mt-1 text-[13px] text-muted">
          从你自己的命盘里走出来的那个声音 —— 陪你照见，而非预言。
        </p>
      </header>

      {qAnswers === null && <Questionnaire profile={profile} onDone={setQAnswers} />}
      {qAnswers && <SelfPortrait chart={profile.chart} questionnaire={qAnswers} />}
      <SpiritPanel profile={profile} />

      <p className="mt-10 text-[12px] leading-relaxed text-muted">
        本命之灵基于你的冻结命盘对话；所有内容仅供自我观照，非预测、非诊断。
      </p>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
