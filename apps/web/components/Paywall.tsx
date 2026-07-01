"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/I18nProvider";

export function Paywall({
  reason = "quota",
  onClose,
}: {
  reason?: "quota" | "limit";
  onClose?: () => void;
}) {
  const [noted, setNoted] = useState(false);
  const t = useT();

  const subtitle =
    reason === "limit"
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
