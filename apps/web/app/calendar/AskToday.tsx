"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deriveSpirit, formatQuestionnaire, type DailyFortune } from "@eamvp/core";
import type { Profile } from "@/lib/profiles";
import { getSpiritMemory, getQuestionnaire } from "@/lib/profiles";
import { dailySpiritGreetingAction } from "@/app/actions";
import { Card } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import { SpiritSigil } from "@/app/chart/SpiritSigil";

export function AskToday({ profile, fortune, dateStr }: { profile: Profile; fortune: DailyFortune; dateStr: string }) {
  const spirit = deriveSpirit(profile.chart);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const mem = await getSpiritMemory(profile.id);
        if (cancelled) return;
        const qa = await getQuestionnaire(profile.id);
        if (cancelled) return;
        const q = qa ? formatQuestionnaire(qa) : undefined;
        const g = await dailySpiritGreetingAction(profile.chart, fortune, dateStr, mem ?? undefined, q);
        if (cancelled) return;
        setGreeting(g);
      } catch {
        setGreeting(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile.id, dateStr, profile.chart, fortune]);

  if (!loading && greeting === null) return null;

  return (
    <Card topAccent={spirit.dominantElement}>
      <div className="mb-3 flex items-center gap-3">
        <SpiritSigil element={spirit.dominantElement} size={40} />
        <div className="min-w-0">
          <h3 className="font-serif text-[16px] font-semibold leading-tight">{spirit.archetype}</h3>
          <p className="mt-0.5 text-[12px] text-muted">本命之灵 · 问今日</p>
        </div>
      </div>
      {loading ? (
        <p className="text-[14px] text-muted">本命之灵正在感应今日… <span className="inline-block animate-pulse text-cinnabar">▋</span></p>
      ) : (
        <>
          <div className="reading-prose">
            <Markdown text={greeting ?? ""} />
          </div>
          <Link
            href="/chart"
            className="mt-3 inline-block text-[12px] text-cinnabar underline underline-offset-4"
          >
            与本命之灵详谈 →
          </Link>
        </>
      )}
    </Card>
  );
}
