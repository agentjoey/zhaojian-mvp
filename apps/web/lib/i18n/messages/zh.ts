export const zh = {
  common: {
    back: "返回",
    loading: "加载中…",
    cancel: "取消",
    confirm: "确认",
    save: "保存",
    delete: "删除",
  },
  nav: {
    home: "首页",
    calendar: "运势",
    chart: "命盘",
    spirit: "本命",
    profiles: "档案",
    account: "账号",
  },
  account: {
    title: "账号",
    signIn: "登录",
    signOut: "登出",
    email: "邮箱",
    loginWithTelegram: "用 Telegram 登录",
    sendMagicLink: "发送登录链接",
    linked: "已绑定",
  },
  paywall: {
    title: "升级会员",
    upgrade: "升级会员",
    monthly: "$9/月",
    yearly: "$99/年",
    comingSoon: "支付即将开放",
  },
} as const;

type DeepStringify<T> = T extends string ? string : { [K in keyof T]: DeepStringify<T[K]> };

export type Messages = DeepStringify<typeof zh>;
