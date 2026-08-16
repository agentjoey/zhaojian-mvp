"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isTelegram } from "./client";

/**
 * SSR/水合安全的「当前是否在 Telegram 里」。
 *
 * 服务端与**首次**客户端渲染一律返回 false，挂载后才切到真实值——两侧首帧一致，
 * 不会水合错位。代价是一次额外渲染，这是该技术固有的，也正是它存在的理由
 * （`isTelegram()` 依赖 `window`，服务端根本拿不到）。
 *
 * 抽出来之前，这三行在 10 个组件里各写了一遍：
 *   const [mounted, setMounted] = useState(false);
 *   useEffect(() => setMounted(true), []);
 *   const inTg = mounted && isTelegram();
 * 于是同一条 `react-hooks/set-state-in-effect` 报了 10 次。规则本身是对的
 * （它防级联重渲染），只是这个模式是刻意且必要的例外——现在例外只需在这里
 * 声明一次，其余代码继续受规则保护。
 */
export function useIsTelegram(): boolean {
  const [inTg, setInTg] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 水合安全所必需，见上方说明
    setInTg(isTelegram());
  }, []);
  return inTg;
}

export function useTgBackButton(opts?: { rootPaths?: string[] }): void {
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isTelegram()) return;
    // 早退而非断言：Mini App 客户端版本不同、能力不同，缺 BackButton 时
    // 静默跳过比抛错好。（此前 `(window as any)` 把这个可能性整个盖住了。）
    const bb = window.Telegram?.WebApp?.BackButton;
    if (!bb) return;
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
  // 渲染期写 ref 会被 react-hooks/refs 报错，且在并发渲染下不安全
  // （渲染可能被丢弃或重放，而副作用已经发生）。放进 effect 才是允许的写法。
  useEffect(() => {
    cbRef.current = o.onClick;
  }, [o.onClick]);

  useEffect(() => {
    if (!isTelegram()) return;
    const mb = window.Telegram?.WebApp?.MainButton;
    if (!mb) return;

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
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
    } catch {}
  },
  medium() {
    try {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium");
    } catch {}
  },
  success() {
    try {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success");
    } catch {}
  },
  error() {
    try {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("error");
    } catch {}
  },
};
