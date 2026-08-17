"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DIRECTION_LABEL } from "@eamvp/core";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { useIsTelegram, haptics } from "@/lib/tg/ui";
import { useT } from "@/lib/i18n/I18nProvider";
import { listDwellings, deleteDwelling, type Dwelling } from "@/lib/dwellings";
import { PageHeader } from "@/components/PageHeader";
import { Group, Cell } from "@/components/tg/native";
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
 *
 * ── EP-fs-tg ─────────────────────────────────────────────────────────────
 * ① 删除确认从原生 `confirm()` 改为**页内两步确认**（与 profiles/page.tsx 同一模式：
 * 点删除 → 原地出现「确认删除?」+ 确认/取消）。原生阻塞对话框在 TG webview 里表现
 * 很差；页内确认在两个宿主里都不差于原生弹窗，所以 **web 与 TG 都改**（spec §4）。
 * ② TG 会话下列表渲染为 `<Group>` + `<Cell>` 原生观感；web 路径为细线分隔的
 *    编辑式清单（2026-08 当代东方重设计，原为 Card 列表）。
 * ③ 数据层分流不在本页：`listDwellings`/`deleteDwelling` 内部已按 hasTgSession()
 * 分流到 /api/tg/fengshui 中介（见 lib/dwellings.ts）。
 */
export default function DwellingsPage() {
  const t = useT();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [dwellings, setDwellings] = useState<Dwelling[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // 页内两步确认（EP-fs-tg）：点「删除」只进入确认态，再点「确认」才真正删。
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // 编辑入口（spec §4.2 / 评审必修1）：DwellingForm 的 `initial` 编辑回显此前没有
  // 任何调用方——生产不可达的死代码，且是用户修正「同住人超限的历史居所」的唯一
  // 入口（见 DwellingForm 截断逻辑注释）。TG 点 Cell、web 点「编辑」进入编辑态，
  // 底部表单区整个换成带回显的编辑表单（同一时刻只渲染一个 DwellingForm，
  // 避免 TG 下两个 MainButton 钩子互相抢）。
  const [editingId, setEditingId] = useState<string | null>(null);

  const inTg = useIsTelegram();

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
    setEditingId(null);
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
    // 不重复发请求。
    if (deletingId === id) return;
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
      setConfirmDeleteId(null);
    }
  }

  // M-b（复验顺手修）：进入编辑态时表单区在页面更下方，居所多于两套时它在首屏
  // 之外——TG 里点 Cell 会「看起来像没反应」。进入编辑态就把表单区滚进视口；
  // 被编辑的行同时给选中态（见下面两个列表分支的 tint 背景）。
  const formSectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!editingId) return;
    // jsdom 没有实现 scrollIntoView——可选调用，测试环境静默跳过。
    formSectionRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [editingId]);

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

  /** 删除按钮 / 两步确认行（web 与 TG 两个分支共用同一个状态机）。 */
  function deleteControls(d: Dwelling) {
    const confirming = confirmDeleteId === d.id;
    return confirming ? (
      <>
        <span className="text-[12px]" style={{ color: "var(--color-cinnabar)" }}>
          {t("fengshui.dwelling.deleteConfirm")}
        </span>
        <button
          type="button"
          onClick={() => { haptics.medium(); handleDelete(d.id); }}
          disabled={deletingId === d.id}
          className="text-[13px] disabled:opacity-50"
          style={{ color: "var(--color-cinnabar)" }}
        >
          {t("common.confirm")}
        </button>
        <button
          type="button"
          onClick={() => setConfirmDeleteId(null)}
          className="text-[13px] text-[var(--color-muted)]"
        >
          {t("common.cancel")}
        </button>
      </>
    ) : (
      <button
        type="button"
        onClick={() => { haptics.light(); setConfirmDeleteId(d.id); }}
        disabled={deletingId === d.id}
        className="text-[13px] disabled:opacity-50"
        style={{ color: "var(--color-cinnabar)" }}
      >
        {t("common.delete")}
      </button>
    );
  }

  function subtitleOf(d: Dwelling): string {
    return `${d.kind === "home" ? t("fengshui.dwelling.kindHome") : t("fengshui.dwelling.kindOffice")} · ${
      d.tenancy === "rent" ? t("fengshui.dwelling.tenancyRent") : t("fengshui.dwelling.tenancyOwn")
    } · ${d.facing ? DIRECTION_LABEL[d.facing] : t("fengshui.dwelling.facingUnknown")}`;
  }

  // 编辑目标。editingId 指向的居所已被删掉（比如刚删完）时回落新增表单。
  const editingDwelling = editingId
    ? (dwellings ?? []).find((d) => d.id === editingId) ?? null
    : null;

  return (
    <main className="mx-auto max-w-[720px] px-4 pb-8 pt-6">
      <Link href="/fengshui" className="text-[13px] text-ink-2">← {t("fengshui.title")}</Link>
      <div className="mt-3">
        <PageHeader kicker="居 所" title={t("fengshui.dwelling.title")} />
      </div>
      {deleteError && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--color-cinnabar)" }}>{deleteError}</p>
      )}

      <section className="mt-6">
        {dwellings === null ? (
          <p className="text-[13px] text-muted">{t("common.loading")}</p>
        ) : dwellings.length === 0 ? (
          <p className="text-[13px] text-muted">{t("fengshui.dwelling.empty")}</p>
        ) : inTg ? (
          // TG：原生列表观感（Group + Cell，与 profiles 页同模式）；操作行贴着对应 Cell。
          <Group>
            {dwellings.map((d) => (
              <div
                key={d.id}
                style={editingId === d.id ? { background: "var(--color-tint)" } : undefined}
              >
                {/* 点 Cell 进入编辑（spec §4.2）；chevron 只在有 onClick 时渲染（M2）。
                    编辑中的行给 tint 选中态——没有它，TG 里点 Cell 像没反应（M-b）。 */}
                <Cell
                  icon={d.name.slice(0, 1)}
                  title={d.name}
                  subtitle={subtitleOf(d)}
                  onClick={() => { haptics.light(); setEditingId(d.id); setConfirmDeleteId(null); }}
                />
                <div className="flex items-center justify-end gap-3 px-[14px] pb-[14px]">
                  {deleteControls(d)}
                </div>
              </div>
            ))}
          </Group>
        ) : (
          // web：细线分隔的编辑式清单（2026-08 当代东方）——居所名宋体做行首，
          // 信息行小号 muted，操作按钮靠右；行间与列表上下各一条 1px 细线。
          <ul className="border-y border-[var(--color-line)] [&>li+li]:border-t [&>li+li]:border-[var(--color-line)]">
            {dwellings.map((d) => (
              // 编辑中的行给选中态（M-b）：1px line-strong 描边 + tint 浅底，
              // 让「正在编辑哪一套」在没有阴影/上浮的语言里仍然一眼可辨。
              <li
                key={d.id}
                className="px-3 py-4"
                style={editingId === d.id
                  ? { outline: "1px solid var(--color-line-strong)", background: "var(--color-tint)" }
                  : undefined}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-serif text-[17px] text-ink">{d.name}</p>
                    <p className="mt-1 text-[11px]" style={{ color: "var(--color-muted)" }}>{subtitleOf(d)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => { setEditingId(d.id); setConfirmDeleteId(null); }}
                      className="text-[13px] text-[var(--color-muted)]"
                    >
                      {t("common.edit")}
                    </button>
                    {deleteControls(d)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" ref={formSectionRef}>
        {/* 新增居所无数量限制、无闸门、无探测（最终评审 I2，理由见文件顶部注释）。
            本页因此不发起任何网络请求——`DwellingForm` 自己会在渲染同住人选择器时
            探测一次合看的会员资格，那是另一条闸门，与「能存几套居所」无关。
            编辑态（spec §4.2）共用同一个表单组件，整个区块换成带回显的编辑表单。 */}
        {editingDwelling ? (
          <>
            <h2 className="text-[16px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.dwelling.editTitle")}</h2>
            <div className="mt-3">
              {/* key 强制重挂载：切到另一套居所时表单 state 整个重置，不回串 */}
              <DwellingForm key={editingDwelling.id} initial={editingDwelling} onSaved={handleSaved} />
            </div>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="mt-3 text-[13px] text-[var(--color-muted)]"
            >
              {t("common.cancel")}
            </button>
          </>
        ) : (
          <>
            <h2 className="text-[16px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.dwelling.add")}</h2>
            <div className="mt-3">
              <DwellingForm onSaved={handleSaved} />
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
