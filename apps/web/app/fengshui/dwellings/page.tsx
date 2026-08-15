"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DIRECTION_LABEL } from "@eamvp/core";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { useT } from "@/lib/i18n/I18nProvider";
import { listDwellings, deleteDwelling, type Dwelling } from "@/lib/dwellings";
import { Card } from "@/components/ui";
import { Paywall } from "@/components/Paywall";
import { supabase } from "@/lib/supabase";
import { DwellingForm } from "../DwellingForm";

const ENABLED = process.env.NEXT_PUBLIC_FENGSHUI_ENABLED === "1";

/**
 * 居所管理页（EP-fs-14）。与「境」系列页面同一套骨架约定（见 ../object/page.tsx）：
 * flag 门控 → 档案读取（Telegram 会话优先，否则匿名档案）→ 内容。居所记录本身按
 * 会话存取、不绑定某个具体档案（见 lib/dwellings.ts），但方位判断的意义依附于命盘——
 * 沿用同一骨架，没有档案时同样先引导去起盘，而不是允许在没有命盘的情况下裸录朝向。
 */
export default function DwellingsPage() {
  const t = useT();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [dwellings, setDwellings] = useState<Dwelling[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // 会员闸门（Task 10，EP-fs-17）：多套居所是会员功能——非会员只能保存一个，第二个
  // 起触发 Paywall。undefined = 尚未探测/无需探测（还没有任何居所，见下方 effect
  // 的守卫）。
  const [entitled, setEntitled] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!ENABLED) return;
    (hasTgSession() ? tgGetProfile() : getActiveProfile())
      .then((p: Profile | null) => setProfile(p))
      .catch(() => setProfile(null));
  }, []);

  useEffect(() => {
    if (!ENABLED || !profile) return;
    listDwellings()
      .then(setDwellings)
      .catch(() => setDwellings([]));
  }, [profile]);

  // 会员闸门探测：只在已经存在至少 1 个居所时才问服务端——首套永远免费，不需要
  // 为这个不影响任何渲染结果的信号多发一次请求。与 /fengshui 页面（page.tsx）
  // 共用同一个 GET /api/fengshui/reading 端点与同一份服务端闸门判断
  // （isFengshuiEntitled），这里只是另一处消费方。
  useEffect(() => {
    if (!dwellings || dwellings.length === 0) {
      setEntitled(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase().auth.getSession();
        const token = data.session?.access_token;
        const r = await fetch("/api/fengshui/reading", {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        if (!r.ok) {
          setEntitled(false);
          return;
        }
        const data2 = (await r.json().catch(() => null)) as { entitled?: boolean } | null;
        if (!cancelled) setEntitled(Boolean(data2?.entitled));
      } catch {
        if (!cancelled) setEntitled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dwellings]);

  function handleSaved(saved: Dwelling) {
    setDwellings((prev) => {
      if (!prev) return [saved];
      const idx = prev.findIndex((d) => d.id === saved.id);
      if (idx === -1) return [...prev, saved];
      const next = [...prev];
      next[idx] = saved;
      return next;
    });
  }

  async function handleDelete(id: string) {
    // 删除不可逆且级联（相关报告一并失效）。防重复：进行中时再次触发（如快速双击）直接忽略，
    // 不重新弹确认框、不重复发请求。
    if (deletingId === id) return;
    if (!confirm(t("fengshui.dwelling.deleteConfirm"))) return;
    setDeleteError(null);
    setDeletingId(id);
    try {
      await deleteDwelling(id);
      setDwellings((prev) => (prev ? prev.filter((d) => d.id !== id) : prev));
    } catch {
      // 失败不能静默：既不让 rejection 逃逸成未捕获异常，也不能把这一项从列表里摘掉——
      // 没删成功，列表就不该表现得像删成功了一样。给用户看得见的反馈，让 ta 可以重试。
      setDeleteError(t("fengshui.dwelling.deleteFailed"));
    } finally {
      setDeletingId(null);
    }
  }

  if (!ENABLED) return <Centered>{t("fengshui.notEnabled")}</Centered>;
  if (profile === undefined) return <Centered>{t("fengshui.loadingProfile")}</Centered>;
  if (profile === null) {
    return (
      <Centered>
        <p className="text-ink-2">{t("fengshui.noProfile")}</p>
        <Link href="/reading" className="mt-4 text-[14px]" style={{ color: "var(--color-cinnabar)" }}>
          {t("fengshui.goCast")}
        </Link>
      </Centered>
    );
  }

  return (
    <main className="mx-auto max-w-[720px] px-4 pb-8 pt-6">
      <Link href="/fengshui" className="text-[13px] text-ink-2">← {t("fengshui.title")}</Link>
      <h1 className="mt-3 text-[22px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.dwelling.title")}</h1>
      {deleteError && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--color-cinnabar)" }}>{deleteError}</p>
      )}

      <section className="mt-6">
        {dwellings === null ? (
          <p className="text-[13px] text-muted">{t("common.loading")}</p>
        ) : dwellings.length === 0 ? (
          <p className="text-[13px] text-muted">{t("fengshui.dwelling.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {dwellings.map((d) => (
              <Card key={d.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] text-ink">{d.name}</p>
                    <p className="mt-1 text-[13px] text-ink-2">
                      {d.kind === "home" ? t("fengshui.dwelling.kindHome") : t("fengshui.dwelling.kindOffice")}
                      {" · "}
                      {d.tenancy === "rent" ? t("fengshui.dwelling.tenancyRent") : t("fengshui.dwelling.tenancyOwn")}
                      {" · "}
                      {d.facing ? DIRECTION_LABEL[d.facing] : t("fengshui.dwelling.facingUnknown")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(d.id)}
                    disabled={deletingId === d.id}
                    className="text-[13px] disabled:opacity-50"
                    style={{ color: "var(--color-cinnabar)" }}
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-[16px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.dwelling.add")}</h2>
        <div className="mt-3">
          {/* 会员闸门（Task 10，EP-fs-17）：多套居所是会员功能。没有居所（首套）时
              永远放行；已有 ≥1 个居所时，未通过 entitled 就把「新增」表单换成
              Paywall——挡的是新增，不影响上面已经渲染出来的既有居所列表。
              entitled === undefined（探测尚未落定）时先不展示表单，避免「先给你
              填、探测完再收回」的糟糕体验；由于探测只在 dwellings.length > 0 时才
              发起，这个中间态通常很短。 */}
          {dwellings && dwellings.length > 0 && entitled === undefined ? (
            <p className="text-[13px] text-muted">{t("common.loading")}</p>
          ) : dwellings && dwellings.length > 0 && !entitled ? (
            <Paywall reason="limit" />
          ) : (
            <DwellingForm onSaved={handleSaved} />
          )}
        </div>
      </section>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
