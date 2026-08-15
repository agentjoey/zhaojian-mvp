"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DIRECTION_LABEL } from "@eamvp/core";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { useT } from "@/lib/i18n/I18nProvider";
import { listDwellings, deleteDwelling, type Dwelling } from "@/lib/dwellings";
import { Card } from "@/components/ui";
import { DwellingForm } from "../DwellingForm";

const ENABLED = process.env.NEXT_PUBLIC_FENGSHUI_ENABLED === "1";

/**
 * 居所管理页（EP-fs-14）。与「境」系列页面同一套骨架约定（见 ../object/page.tsx）：
 * flag 门控 → 档案读取（Telegram 会话优先，否则匿名档案）→ 内容。居所记录本身按
 * 会话存取、不绑定某个具体档案（见 lib/dwellings.ts），但方位判断的意义依附于命盘——
 * 沿用同一骨架，没有档案时同样先引导去起盘，而不是允许在没有命盘的情况下裸录朝向。
 *
 * ── 为什么本页没有会员闸门（最终评审 I2）─────────────────────────────────
 * Task 10 曾把「保存第 2 套居所」挡在付费墙后（非会员看到「已达免费版上限，升级
 * 会员后可继续保存」），连同一整套 `probing/entitled/blocked/unknown` 探测状态机。
 * 已撤除，因为**第 2 套居所不被任何东西读取**：`../page.tsx` 与 `../object/page.tsx`
 * 都硬编码 `dwellings[0]`，居所切换器未实现。升级会员换来的只是这个管理列表里多一行、
 * 别无他物——为一个没有可观察产出的能力收费，是唯一不可辩护的组合。
 *
 * ⚠️ 撤的**只是**多居所这一条。Layer 1 本身的闸门（宅盘 / 合看 / 分级化解）有真实
 * 可观察差异，仍然生效，分别在 `../page.tsx`、`../DwellingForm.tsx`、
 * `../object/page.tsx` 以及服务端 `api/fengshui/reading` 的 402 上。
 *
 * 日后若真的实现居所切换器，多居所才重新成为一项会员权益、闸门才值得加回来——
 * 但那时还需要一条服务端写入路径：`createDwelling` 目前是浏览器直写 supabase，
 * 客户端闸门可以被直接绕过。别只把付费墙贴回来就当数。
 */
export default function DwellingsPage() {
  const t = useT();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [dwellings, setDwellings] = useState<Dwelling[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
        {/* 新增居所无数量限制、无闸门、无探测（最终评审 I2，理由见文件顶部注释）。
            本页因此不发起任何网络请求——`DwellingForm` 自己会在渲染同住人选择器时
            探测一次合看的会员资格，那是另一条闸门，与「能存几套居所」无关。 */}
        <div className="mt-3">
          <DwellingForm onSaved={handleSaved} />
        </div>
      </section>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
