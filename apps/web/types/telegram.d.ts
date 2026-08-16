/**
 * Telegram Mini App (WebApp) 的**最小**环境类型——只声明本仓库实际用到的表面，
 * 不追求覆盖官方全部 API：没用到的东西声明出来只会给「其实没接过的调用」发通行证。
 *
 * 为什么需要它：`lib/tg/client.ts` 此前就写了一份 `declare global { Window.Telegram }`，
 * 但每个调用点又写 `(window as any).Telegram…` 把它整个绕过去——声明形同虚设，
 * 14 处 `no-explicit-any` 由此而来。把声明提到这里（ambient，全项目可见），
 * 调用点就能直接用 `window.Telegram`，类型和 lint 同时干净。
 *
 * 一切成员都是可选的：Mini App 客户端版本不同，能力不同；调用一律走 `?.`。
 */

interface TelegramWebAppButton {
  show?: () => void;
  hide?: () => void;
  onClick?: (cb: () => void) => void;
  offClick?: (cb: () => void) => void;
}

interface TelegramMainButton extends TelegramWebAppButton {
  setText?: (text: string) => void;
  enable?: () => void;
  disable?: () => void;
}

interface TelegramWebApp {
  initData?: string;
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, string>;

  ready?: () => void;
  expand?: () => void;
  setHeaderColor?: (color: string) => void;
  enableClosingConfirmation?: () => void;
  openTelegramLink?: (url: string) => void;

  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;

  BackButton?: TelegramWebAppButton;
  MainButton?: TelegramMainButton;
  HapticFeedback?: {
    impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred?: (type: "error" | "success" | "warning") => void;
  };
}

declare global {
  /**
   * Telegram 登录 Widget 的用户载荷（widget 直接回调到全局函数上，形状由 Telegram 定）。
   * ⚠️ 必须写在 `declare global` 内：本文件末尾有 `export {}`，是模块，
   * 块外的接口不会成为全局类型。
   */
  interface TelegramLoginUser {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    auth_date: number;
    hash: string;
  }

  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
    /** 登录 Widget 的 `data-onauth` 目标——必须挂在 window 上，widget 只认全局名。 */
    onTelegramAuth?: (user: TelegramLoginUser) => void;
    /** 同上，用于「已登录后再绑定 TG」那条链路。 */
    onTelegramLink?: (user: TelegramLoginUser) => void;
  }
}

export {};
