"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listProfiles, getActiveProfileId, setActiveProfile, deleteProfile, type Profile } from "@/lib/profiles";
import { hasTgSession, isTelegram, tgListProfiles, tgDeleteProfile } from "@/lib/tg/client";
import { supabase } from "@/lib/supabase";
import { Card, SealIcon } from "@/components/ui";
import { Group, Cell } from "@/components/tg/native";
import { useT } from "@/lib/i18n/I18nProvider";

export default function ProfilesPage() {
  const router = useRouter();
  const t = useT();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);
  const inTg = mounted && isTelegram();

  useEffect(() => {
    if (editingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [editingId]);

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

  async function doRename(profileId: string) {
    const trimmed = renameValue.trim();
    if (trimmed.length < 1 || trimmed.length > 24) {
      alert(t("profiles.nicknameLengthError"));
      return;
    }
    const { data: { session } } = await supabase().auth.getSession();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const r = await fetch("/api/account/rename", {
      method: "POST",
      headers,
      body: JSON.stringify({ profileId, nickname: trimmed }),
    });
    if (!r.ok) {
      const msg = await r.text().catch(() => t("profiles.renameFailed"));
      alert(msg);
      return;
    }
    setEditingId(null);
    refresh();
  }

  async function doDelete(profileId: string) {
    if (hasTgSession()) {
      await tgDeleteProfile(profileId);
    } else {
      await deleteProfile(profileId);
    }
    setConfirmDeleteId(null);
    refresh();
  }

  function startRename(p: Profile) {
    setEditingId(p.id);
    setRenameValue(p.nickname);
    setConfirmDeleteId(null);
  }

  const actionBase = "text-[12px] text-[var(--color-muted)] hover:text-[var(--color-seal)] transition-colors";
  const dangerBase = "text-[12px] text-[var(--color-cinnabar)] hover:text-[var(--color-cinnabar-press)] transition-colors";
  const inputClass = "rounded border px-2 py-1 text-[13px] outline-none focus:border-[var(--color-cinnabar)]";
  const inputStyle = { borderColor: "var(--color-line)", background: "var(--color-paper)", color: "var(--color-ink)" };

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-[28px] font-black">{t("profiles.title")}</h1>
        <Link href="/reading" className="px-5 py-2.5 text-[14px] text-on-ink" style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}>{t("profiles.create")}</Link>
      </header>

      {loading ? (
        <Card><p className="text-[14px] text-muted">{t("profiles.loading")}</p></Card>
      ) : profiles.length === 0 ? (
        <Card><p className="text-[14px] text-muted">{t("profiles.empty")}</p></Card>
      ) : inTg ? (
        <Group>
          {profiles.map((p) => {
            const active = p.id === activeId;
            const editing = editingId === p.id;
            const confirming = confirmDeleteId === p.id;
            return (
              <div key={p.id}>
                <Cell
                  icon={p.nickname.slice(0, 1)}
                  accent={"var(--color-cinnabar)"}
                  title={p.nickname + (active ? " · " + t("profiles.current") : "")}
                  subtitle={`${p.chart.bazi.dayMaster}（${p.chart.bazi.dayMasterElement}）· ${p.birthInput.date}`}
                  onClick={() => {
                    setActiveProfile(p.id);
                    router.push("/chart");
                  }}
                />
                <div className="flex items-center justify-end gap-3 px-[14px] pb-[14px]">
                  {editing ? (
                    <>
                      <input
                        ref={renameRef}
                        className={inputClass}
                        style={inputStyle}
                        value={renameValue}
                        maxLength={24}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") doRename(p.id); if (e.key === "Escape") setEditingId(null); }}
                      />
                      <button className={actionBase} onClick={() => doRename(p.id)}>{t("common.save")}</button>
                      <button className={actionBase} onClick={() => setEditingId(null)}>{t("common.cancel")}</button>
                    </>
                  ) : (
                    <button className={actionBase} onClick={() => startRename(p)}>{t("profiles.rename")}</button>
                  )}
                  {confirming ? (
                    <>
                      <span className="text-[12px] text-[var(--color-cinnabar)]">{t("profiles.confirmDelete")}</span>
                      <button className={dangerBase} onClick={() => doDelete(p.id)}>{t("common.confirm")}</button>
                      <button className={actionBase} onClick={() => setConfirmDeleteId(null)}>{t("common.cancel")}</button>
                    </>
                  ) : (
                    <button className={actionBase} onClick={() => { setConfirmDeleteId(p.id); setEditingId(null); }}>{t("common.delete")}</button>
                  )}
                </div>
              </div>
            );
          })}
        </Group>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => {
            const active = p.id === activeId;
            const editing = editingId === p.id;
            const confirming = confirmDeleteId === p.id;
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
                      {active && <span className="ml-2 text-[11px] text-cinnabar">{t("profiles.current")}</span>}
                    </div>
                    <div className="latin-label text-[10px] text-muted">
                      {p.chart.bazi.dayMaster}（{p.chart.bazi.dayMasterElement}）· {p.birthInput.date}
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-3">
                  {editing ? (
                    <>
                      <input
                        ref={renameRef}
                        className={inputClass}
                        style={inputStyle}
                        value={renameValue}
                        maxLength={24}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") doRename(p.id); if (e.key === "Escape") setEditingId(null); }}
                      />
                      <button className={actionBase} onClick={() => doRename(p.id)}>{t("common.save")}</button>
                      <button className={actionBase} onClick={() => setEditingId(null)}>{t("common.cancel")}</button>
                    </>
                  ) : (
                    <button className={actionBase} onClick={() => startRename(p)}>{t("profiles.rename")}</button>
                  )}
                  {confirming ? (
                    <>
                      <span className="text-[12px] text-[var(--color-cinnabar)]">{t("profiles.confirmDelete")}</span>
                      <button className={dangerBase} onClick={() => doDelete(p.id)}>{t("common.confirm")}</button>
                      <button className={actionBase} onClick={() => setConfirmDeleteId(null)}>{t("common.cancel")}</button>
                    </>
                  ) : (
                    <button
                      className={actionBase}
                      onClick={() => { setConfirmDeleteId(p.id); setEditingId(null); }}
                    >
                      {t("common.delete")}
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-[12px] leading-relaxed text-muted">
        {t("profiles.privacyNotice")}
      </p>
    </main>
  );
}
