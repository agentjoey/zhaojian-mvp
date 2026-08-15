"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { SpiritPanel } from "@/app/chart/SpiritPanel";
import { useT } from "@/lib/i18n/I18nProvider";

const ENABLED = process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1";

export default function SpiritPage() {
  const t = useT();
  const [topic, setTopic] = useState<string | null>(null);
  // 最终评审 Blocking 2：/fengshui 每条化解卡片的「和 Mira 聊聊这条」链接携带
  // ?topic=fengshui&q=<该条化解的动作文本>（见 apps/web/app/fengshui/page.tsx）。
  // `query` 就是那段动作文本本身——原始素材，不是 remedyId；下面据此拼出 autoSend。
  const [query, setQuery] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTopic(params.get("topic"));
    setQuery(params.get("q"));
  }, []);

  useEffect(() => {
    if (!ENABLED) return;
    (hasTgSession() ? tgGetProfile() : getActiveProfile())
      .then((p: Profile | null) => setProfile(p))
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

  // topic=portrait：既有的画像开场白（固定文案，不带 URL 参数）。
  // topic=fengshui：q 是「境」页某条化解自己的动作文本（不是 remedyId），
  // 用 talkFengshuiMessage 模板拼成一句关于这条化解的提问；没有 q（畸形链接）时
  // 不拼——总不能对着空动作文本造出一句不知所云的话。
  // 其余情况（含未带 topic）不自动发送。
  const autoSend =
    topic === "portrait"
      ? t("spirit.talkPortraitMessage")
      : topic === "fengshui" && query
        ? t("spirit.talkFengshuiMessage", { action: query })
        : undefined;

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
      <SpiritPanel profile={profile} autoSend={autoSend} />
      <p className="px-5 pb-2 pt-1 text-[11px] leading-relaxed text-muted">{t("spirit.disclaimer")}</p>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
