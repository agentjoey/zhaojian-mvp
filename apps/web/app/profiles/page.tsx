"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listProfiles, getActiveProfileId, setActiveProfile, deleteProfile, type Profile } from "@/lib/profiles";
import { hasTgSession, isTelegram, tgListProfiles } from "@/lib/tg/client";
import { Card, SealIcon } from "@/components/ui";
import { Group, Cell } from "@/components/tg/native";

export default function ProfilesPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  const inTg = mounted && isTelegram();

  function refresh() {
    setLoading(true);
    const fetcher = hasTgSession() ? tgListProfiles() : listProfiles();
    fetcher
      .then((list) => {
        setProfiles(list);
        setActiveId(hasTgSession() ? (list[0]?.id ?? null) : (getActiveProfileId() ?? list[0]?.id ?? null));
      })
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }
  useEffect(refresh, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-[28px] font-black">我的档案</h1>
        <Link href="/reading" className="px-5 py-2.5 text-[14px] text-on-ink" style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}>新建档案</Link>
      </header>

      {loading ? (
        <Card><p className="text-[14px] text-muted">正在读取档案…</p></Card>
      ) : profiles.length === 0 ? (
        <Card><p className="text-[14px] text-muted">尚无档案。建档后命盘一次生成并冻结，不再更改。</p></Card>
      ) : inTg ? (
        <Group>
          {profiles.map((p) => {
            const active = p.id === activeId;
            return (
              <Cell
                key={p.id}
                icon={p.nickname.slice(0, 1)}
                accent={"var(--color-cinnabar)"}
                title={p.nickname + (active ? " · 当前" : "")}
                subtitle={`${p.chart.bazi.dayMaster}（${p.chart.bazi.dayMasterElement}）· ${p.birthInput.date}`}
                onClick={() => {
                  setActiveProfile(p.id);
                  router.push("/chart");
                }}
              />
            );
          })}
        </Group>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => {
            const active = p.id === activeId;
            return (
              <Card key={p.id} className="flex items-center justify-between gap-4">
                <button
                  className="flex items-center gap-3 text-left"
                  onClick={() => {
                    setActiveProfile(p.id);
                    router.push("/chart");
                  }}
                >
                  <SealIcon char={p.nickname.slice(0, 1)} size={40} variant={active ? "bai" : "zhu"} />
                  <div>
                    <div className="text-[16px] font-semibold">
                      {p.nickname}
                      {active && <span className="ml-2 text-[11px] text-cinnabar">当前</span>}
                    </div>
                    <div className="latin-label text-[10px] text-muted">
                      {p.chart.bazi.dayMaster}（{p.chart.bazi.dayMasterElement}）· {p.birthInput.date}
                    </div>
                  </div>
                </button>
                <button
                  className="text-[12px] text-muted hover:text-seal"
                  onClick={async () => {
                    if (confirm(`删除档案「${p.nickname}」？`)) {
                      await deleteProfile(p.id);
                      refresh();
                    }
                  }}
                >
                  删除
                </button>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-[12px] leading-relaxed text-muted">
        档案存于你的私人空间（匿名、按设备隔离，仅你可见），可随时删除。命盘建档时一次推算并冻结，不再更改。
      </p>
    </main>
  );
}
