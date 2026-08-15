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
 * 会员闸门探测状态。与 `../page.tsx` 的 `EntitlementState` 同一套语义（各自本地声明，
 * 避免两个 Next page 模块互相 import 类型）——关键在于 **`unknown` 必须与 `blocked`
 * 分开**：修复单 Critical 1 指出的是 `/fengshui`，但本页原来犯的是**完全相同**的错
 * （探测失败 → `setEntitled(false)` → 付费墙取代新增表单）。`BILLING_ENABLED` 未设置
 * 是默认配置，此时服务端对任何人都放行，一次网络抖动就把用户本来能用的新增表单
 * 换成推销，是同一个泄漏。
 */
type EntitlementState = "idle" | "probing" | "entitled" | "blocked" | "unknown";

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
  // 起触发 Paywall。`idle` = 无需探测（还没有任何居所，见下方 effect 的守卫）。
  const [entitlement, setEntitlement] = useState<EntitlementState>("idle");
  // 点一次「重新确认」就 +1，进入下方探测 effect 的依赖数组，让探测失败可被用户救回。
  const [entitlementRetryNonce, setEntitlementRetryNonce] = useState(0);

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
      setEntitlement("idle");
      return;
    }
    let cancelled = false;
    setEntitlement("probing");
    (async () => {
      try {
        // Authorization：TG 会话走 cookie（同源请求自动带上），本地匿名/邮箱登录靠
        // 这个头，服务端才能识别出「其实是会员」，不会被误挡成非会员。
        const { data } = await supabase().auth.getSession();
        const token = data.session?.access_token;
        const r = await fetch("/api/fengshui/reading", {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        // 非 2xx / body 读不出布尔值 = 基础设施失败，不是「服务端判定你不是会员」
        // （本路由的正常回答永远是 200 + { entitled }）。当成 blocked 就是把
        // 「不知道」说成「没有权限」——见顶部 EntitlementState 注释。
        if (!r.ok) {
          setEntitlement("unknown");
          return;
        }
        const data2 = (await r.json().catch(() => null)) as { entitled?: boolean } | null;
        if (cancelled) return;
        if (typeof data2?.entitled !== "boolean") {
          setEntitlement("unknown");
          return;
        }
        setEntitlement(data2.entitled ? "entitled" : "blocked");
      } catch {
        if (!cancelled) setEntitlement("unknown");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dwellings, entitlementRetryNonce]);

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

  /** 已经存在至少一个居所——首套永远免费，闸门只对「再加一个」生效。 */
  const hasDwellings = !!dwellings && dwellings.length > 0;
  /** 探测尚未落定（含"还没开始探"）：给加载态，绝不给付费墙。 */
  const entitlementPending = entitlement === "idle" || entitlement === "probing";

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
              永远放行；已有 ≥1 个居所时才按闸门状态分支——挡的是新增，不影响上面
              已经渲染出来的既有居所列表。
              四种状态各自有对应渲染：探测在途 → 加载态（避免「先给你填、探测完
              再收回」）；探测失败 → 「重新确认」（修复单 Critical 1 同类：未知
              ≠ 非会员，不能给一个多半本来就有权限的用户推销）；明确未放行 →
              Paywall；放行 → 表单。 */}
          {!hasDwellings ? (
            <DwellingForm onSaved={handleSaved} />
          ) : entitlementPending ? (
            <p className="text-[13px] text-muted">{t("common.loading")}</p>
          ) : entitlement === "unknown" ? (
            <div>
              <p className="text-[13px] text-muted">{t("fengshui.entitlementUnknown")}</p>
              <button
                type="button"
                onClick={() => setEntitlementRetryNonce((n) => n + 1)}
                className="mt-2 text-[13px]"
                style={{ color: "var(--color-cinnabar)" }}
              >
                {t("fengshui.retryEntitlement")}
              </button>
            </div>
          ) : entitlement === "blocked" ? (
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
