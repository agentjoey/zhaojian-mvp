"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { useIsTelegram, useTgMainButton, haptics } from "@/lib/tg/ui";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/I18nProvider";

export default function DreamPage() {
  const t = useT();
  const inTg = useIsTelegram();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [dream, setDream] = useState("");
  const [reading, setReading] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setProfile(hasTgSession() ? await tgGetProfile() : await getActiveProfile());
      } catch {
        setProfile(null);
      }
    })();
  }, []);

  const tooLong = dream.trim().length > 2000;
  const canSubmit = !!profile && dream.trim().length >= 4 && !tooLong && !pending;

  async function submit() {
    if (!profile || !canSubmit) return;
    setPending(true);
    setError(null);
    setReading(null);
    haptics.light();
    try {
      const res = hasTgSession()
        ? await fetch("/api/tg/dream", { method: "POST", body: JSON.stringify({ dream }) })
        : await fetch("/api/spirit/dream", { method: "POST", body: JSON.stringify({ chart: profile.chart, dream }) });
      if (!res.ok) throw new Error(await res.text());
      setReading(await res.text());
      haptics.success();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  useTgMainButton({ text: pending ? t("dream.interpreting") : t("dream.submit"), onClick: submit, enabled: canSubmit, visible: inTg });

  if (profile === undefined) return null;
  if (profile === null)
    return (
      <main className="mx-auto max-w-[720px] px-4 py-10">
        <PageHeader kicker={t("dream.kicker")} title={t("dream.title")} />
        <p className="mt-6 text-[14px] text-ink-2">{t("dream.noProfile")}</p>
        <Link href="/reading" className="mt-4 inline-block text-[13px] underline underline-offset-4" style={{ color: "var(--color-cinnabar)" }}>
          {t("reading.kicker")} →
        </Link>
      </main>
    );

  return (
    <main className="mx-auto max-w-[720px] px-4 pb-8 pt-6">
      <PageHeader kicker={t("dream.kicker")} title={t("dream.title")} annotation={t("dream.subtitle")} />
      <div className="mt-6">
        <textarea
          value={dream}
          onChange={(e) => setDream(e.target.value)}
          placeholder={t("dream.placeholder")}
          rows={5}
          className="w-full resize-none bg-transparent p-4 text-[15px] leading-[1.9] outline-none focus:border-[var(--color-line-strong)]"
          style={{ border: "1px solid var(--color-line)", borderRadius: "var(--radius-card)", color: "var(--color-ink)" }}
        />
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
          <span>{tooLong ? t("dream.errorTooLong") : ""}</span>
          <span className="font-latin">{dream.trim().length}/2000</span>
        </div>
        {!inTg && (
          <div className="mt-4">
            <Button onClick={submit} disabled={!canSubmit}>
              {pending ? t("dream.interpreting") : t("dream.submit")}
            </Button>
          </div>
        )}
        {error && (
          <div className="mt-4 px-4 py-3 text-[13px]" style={{ borderRadius: "var(--radius-card)", background: "var(--color-error-bg)", color: "var(--color-seal)", border: "1px solid var(--color-error-line)" }}>
            {error}
          </div>
        )}
        {reading && (
          <div className="zj-rise mt-8 pt-6" style={{ borderTop: "1px solid var(--color-line)" }}>
            <div className="text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>{t("dream.kicker")}</div>
            <p className="reading-prose mt-3 whitespace-pre-wrap">{reading}</p>
          </div>
        )}
      </div>
    </main>
  );
}
