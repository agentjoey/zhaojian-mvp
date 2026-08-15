"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/I18nProvider";

/**
 * `reason` 决定副标题措辞，三者语义不同、不可互借：
 * - `quota`  免费额度用尽（对话等按次计费的场景）
 * - `limit`  数量已达上限（还能再存，但要升级）
 * - `member` 这块内容本身属于会员功能——**没有**"上限"也没有要"保存"的东西
 *            （Task 10 修复单 Important 5：/fengshui 的宅八方位置此前错用了 `limit`，
 *            当时的文案在说"档案已达上限/Profile limit reached"，那里既没有档案也
 *            没有在保存任何东西，英文尤其误导）。
 *
 * `limit` 的文案同期也改成了实体无关的措辞（原文点名"档案"，而它唯一的调用点
 * /fengshui/dwellings 达上限的是**居所**）——两处都是同一个毛病：付费墙文案说的
 * 实体和它实际出现的位置对不上。新增调用点前先确认措辞在那个位置上是真话。
 *
 * ⚠️ 新增 reason 分支不等于新增计费形态——这里没有引入任何支付机制（Stripe /
 * TG Stars 仍然只是"即将开放"的占位文案），只是把已有付费墙的措辞说准。
 */
export function Paywall({
  reason = "quota",
  onClose,
}: {
  reason?: "quota" | "limit" | "member";
  onClose?: () => void;
}) {
  const [noted, setNoted] = useState(false);
  const t = useT();

  const subtitle =
    reason === "member"
      ? t("paywall.subtitleMember")
      : reason === "limit"
        ? t("paywall.subtitleLimit")
        : t("paywall.subtitleQuota");

  return (
    <div
      className="w-full"
      style={{
        borderRadius: "var(--radius-card)",
        background: "var(--color-surface)",
        border: "1px solid var(--color-line)",
        color: "var(--color-ink)",
      }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3
            className="text-lg font-semibold"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {t("paywall.title")}
          </h3>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="text-[15px] leading-none transition"
              style={{ color: "var(--color-muted)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--color-ink)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--color-muted)")
              }
            >
              ✕
            </button>
          )}
        </div>

        <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>
          {subtitle}
        </p>

        <div
          className="mt-4 text-2xl font-semibold"
          style={{ color: "var(--color-ink)" }}
        >
          {t("paywall.monthly")} · {t("paywall.yearly")}
        </div>

        <Button
          className="mt-4 w-full"
          onClick={() => setNoted(true)}
          disabled={noted}
        >
          {t("paywall.upgrade")}
        </Button>

        {noted && (
          <p
            className="mt-3 text-center text-sm"
            style={{ color: "var(--color-cinnabar)" }}
          >
            {t("paywall.comingSoon")}
          </p>
        )}

        <p
          className="mt-3 text-center text-xs"
          style={{ color: "var(--color-muted)" }}
        >
          {t("paywall.telegramIAP")}
        </p>
      </div>
    </div>
  );
}
