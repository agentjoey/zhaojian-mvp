"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/I18nProvider";

/**
 * `reason` 决定副标题措辞，两者语义不同、不可互借：
 * - `quota`  免费额度用尽（对话等按次计费的场景）
 * - `member` 这块内容本身属于会员功能——**没有**"上限"也没有要"保存"的东西
 *            （Task 10 修复单 Important 5：/fengshui 的宅八方位置此前错用了当时的
 *            `limit` 分支，那条文案在说"档案已达上限/Profile limit reached"，
 *            那里既没有档案也没有在保存任何东西，英文尤其误导）。
 *
 * 曾有第三个分支 `limit`（"已达免费版上限，升级会员后可继续保存"）。它唯一的调用点
 * 是 /fengshui/dwellings 的「保存第 2 套居所」，而那道闸门在最终评审 I2 里被撤除了
 * （第 2 套居所不被任何东西读取，付的钱换不到任何可观察产出）。分支与文案一并删除，
 * 不留没有调用点的死代码——留着的直接代价是：/fengshui 那条"宅盘位置不得使用 limit
 * 文案"的反向断言会变成恒真（被断言的字符串在运行时代码里已不存在），而这个仓库
 * 已经因为同一个形状的恒真断言栽过一次（`47e9faa`）。
 * 日后真有「数量上限」场景，照着 quota/member 的写法重新加一个分支即可。
 *
 * ⚠️ 新增 reason 分支不等于新增计费形态——这里没有引入任何支付机制（Stripe /
 * TG Stars 仍然只是"即将开放"的占位文案），只是把已有付费墙的措辞说准。
 */
export function Paywall({
  reason = "quota",
  onClose,
}: {
  reason?: "quota" | "member";
  onClose?: () => void;
}) {
  const [noted, setNoted] = useState(false);
  const t = useT();

  const subtitle = reason === "member" ? t("paywall.subtitleMember") : t("paywall.subtitleQuota");

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
