"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deriveSpirit, formatQuestionnaire, type DailyFortune } from "@eamvp/core";
import type { Profile } from "@/lib/profiles";
import { getSpiritMemory, getQuestionnaire } from "@/lib/profiles";
import { hasTgSession, tgDaily } from "@/lib/tg/client";
import { dailySpiritGreetingAction } from "@/app/actions";
import { Card } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import { Paywall } from "@/components/Paywall";
import { SpiritSigil } from "@/app/chart/SpiritSigil";
import { useT } from "@/lib/i18n/I18nProvider";

export function AskToday({ profile, fortune, dateStr }: { profile: Profile; fortune: DailyFortune; dateStr: string }) {
  const t = useT();
  const spirit = deriveSpirit(profile.chart);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paywall, setPaywall] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPaywall(false);
    (async () => {
      try {
        if (hasTgSession()) {
          const { greeting: g } = await tgDaily(dateStr);
          if (cancelled) return;
          setGreeting(g);
        } else {
          const mem = await getSpiritMemory(profile.id);
          if (cancelled) return;
          const qa = await getQuestionnaire(profile.id);
          if (cancelled) return;
          const q = qa ? formatQuestionnaire(qa) : undefined;
          const g = await dailySpiritGreetingAction(profile.chart, fortune, dateStr, mem ?? undefined, q);
          if (cancelled) return;
          setGreeting(g);
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("paywall")) {
          setPaywall(true);
        } else {
          setGreeting(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile.id, dateStr, profile.chart, fortune]);

  if (paywall) {
    return (
      <Card topAccent={spirit.dominantElement}>
        <Paywall reason="quota" />
      </Card>
    );
  }

  if (!loading && greeting === null) return null;

  return (
    <Card topAccent={spirit.dominantElement}>
      <div className="mb-3 flex items-center gap-3">
        <SpiritSigil element={spirit.dominantElement} size={40} />
        <div className="min-w-0">
          <h3 className="font-serif text-[16px] font-semibold leading-tight">{spirit.archetype}</h3>
          <p className="mt-0.5 text-[12px] text-muted">{t("calendar.spiritCardLabel")}</p>
        </div>
      </div>
      {loading ? (
        <p className="text-[14px] text-muted">{t("calendar.spiritLoading")} <span className="inline-block animate-pulse text-cinnabar">▋</span></p>
      ) : (
        <>
          <div className="reading-prose">
            <Markdown text={greeting ?? ""} />
          </div>
          <Link
            href="/spirit"
            className="mt-3 inline-block text-[12px] text-cinnabar underline underline-offset-4"
          >
            {t("calendar.talkToSpirit")}
          </Link>
        </>
      )}
    </Card>
  );
}
