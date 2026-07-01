"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function Paywall({
  reason = "quota",
  onClose,
}: {
  reason?: "quota" | "limit";
  onClose?: () => void;
}) {
  const [noted, setNoted] = useState(false);

  const subtitle =
    reason === "limit"
      ? "档案已达上限，升级会员后可继续保存。"
      : "免费额度已用尽，升级会员后可继续对话。";

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
            升级会员，解锁无限
          </h3>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
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
          $9/月 · $99/年
        </div>

        <Button
          className="mt-4 w-full"
          onClick={() => setNoted(true)}
          disabled={noted}
        >
          升级会员
        </Button>

        {noted && (
          <p
            className="mt-3 text-center text-sm"
            style={{ color: "var(--color-cinnabar)" }}
          >
            支付即将开放，敬请期待
          </p>
        )}

        <p
          className="mt-3 text-center text-xs"
          style={{ color: "var(--color-muted)" }}
        >
          Telegram 内购即将开放
        </p>
      </div>
    </div>
  );
}
