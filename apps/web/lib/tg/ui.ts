"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isTelegram } from "./client";

export function useTgBackButton(opts?: { rootPaths?: string[] }): void {
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isTelegram()) return;
    const bb = (window as any).Telegram.WebApp.BackButton;
    const roots = opts?.rootPaths ?? ["/"];
    const onRoot = roots.includes(path);

    if (onRoot) {
      bb.hide?.();
      return;
    }

    const cb = () => router.back();
    bb.show?.();
    bb.onClick?.(cb);

    return () => {
      bb.offClick?.(cb);
      bb.hide?.();
    };
  }, [path]);
}

export function useTgMainButton(o: {
  text: string;
  onClick: () => void;
  enabled?: boolean;
  visible?: boolean;
}): void {
  const cbRef = useRef(o.onClick);
  cbRef.current = o.onClick;

  useEffect(() => {
    if (!isTelegram()) return;
    const mb = (window as any).Telegram.WebApp.MainButton;

    if (o.visible === false) {
      mb.hide?.();
      return;
    }

    mb.setText?.(o.text);
    if (o.enabled === false) {
      mb.disable?.();
    } else {
      mb.enable?.();
    }
    mb.show?.();

    const cb = () => cbRef.current();
    mb.onClick?.(cb);

    return () => {
      mb.offClick?.(cb);
      mb.hide?.();
    };
  }, [o.text, o.enabled, o.visible]);
}

export const haptics = {
  light() {
    try {
      (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
    } catch {}
  },
  medium() {
    try {
      (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium");
    } catch {}
  },
  success() {
    try {
      (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success");
    } catch {}
  },
  error() {
    try {
      (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("error");
    } catch {}
  },
};
