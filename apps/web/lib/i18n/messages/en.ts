import type { Messages } from "./zh";

export const en: Messages = {
  common: {
    back: "Back",
    loading: "Loading…",
    cancel: "Cancel",
    confirm: "Confirm",
    save: "Save",
    delete: "Delete",
    close: "Close",
    sending: "Sending…",
    signingIn: "Signing in…",
    brand: "照见 (Zhaojian)",
    listSeparator: ", ",
  },
  nav: {
    home: "Home",
    calendar: "Fortune",
    chart: "Chart",
    reading: "Reading",
    spirit: "Spirit",
    profiles: "Profiles",
    account: "Account",
  },
  account: {
    title: "Account",
    saveYourZhaojian: "Save your 照见 (Zhaojian)",
    signIn: "Sign in",
    signOut: "Sign out",
    email: "Email",
    emailAddress: "Email address",
    loginWithTelegram: "Log in with Telegram",
    sendMagicLink: "Send magic link",
    linked: "Linked",
    notLinked: "Not linked",
    mergedProfiles: "Merged {count} local profiles into your account",
    tierMember: "Member",
    tierFree: "Free",
    expiresOn: "Expires {date}",
    usageThisMonth: "Used {used}/{free} this month",
    loggedInViaTelegram: "Logged in via Telegram",
    linkEmailLabel: "Link email",
    linkEmailSent:
      "Confirmation email sent. Check your inbox and click the link to finish linking.",
    linkEmailInUse: "This email is already linked to another account",
    linkFailed: "Link failed, please try again",
    tgAlreadyLinked:
      "This Telegram is linked to another account. Please log in and merge instead",
    invalidEmail: "Please enter a valid email address",
    anonymousDescription:
      "You're in local anonymous mode. Sign in to sync your profiles and readings across devices.",
    magicLinkSent: "Sent. Check your email for the sign-in link.",
    dangerZone: "Danger Zone · Delete Account",
    deleteWarning:
      "This action is irreversible. Your account, all profiles, chat history, membership and Telegram link will be permanently deleted and cannot be recovered.",
    deleteAccount: "Delete account",
    confirmDelete: "Confirm deletion",
    deleting: "Deleting…",
    deleteFailed: "Deletion failed, please try again",
    deleteAcknowledge:
      "I understand this action is irreversible and will permanently delete all my profiles and data",
    language: "Language",
  },
  paywall: {
    title: "Upgrade to unlock unlimited",
    upgrade: "Upgrade",
    monthly: "$9/month",
    yearly: "$99/year",
    comingSoon: "Payments coming soon",
    telegramIAP: "Telegram in-app purchases coming soon",
    subtitleLimit: "Profile limit reached. Upgrade to save more.",
    subtitleQuota: "Free quota used. Upgrade to continue chatting.",
  },
  home: {
    heroTitle1: "Your chart,",
    heroTitle2: "is a mirror",
    heroSubtitle:
      "Ziwei · Bazi × depth psychology. A mirror for self-reflection, not a verdict on fortune.",
    ctaButton: "Cast my chart · Instant",
    entries: {
      calendar: { title: "Daily fortune", sub: "Daily flow · one push a day" },
      annual: { title: "Yearly cycle", sub: "Annual themes · 大限四化 (Four Transforms)" },
      chart: { title: "My chart", sub: "命理 (Mingli) + psychological reading" },
      reading: { title: "Cast chart", sub: "Birth info instant chart" },
    },
    cards: {
      east: {
        label: "East · 命理结构 (Mingli structure)",
        text: "紫微十二宫 (Ziwei twelve houses), 八字四柱 (Bazi four pillars), 生年四化 (natal Four Transforms) — computed precisely by an open engine, auditable, never invented.",
      },
      west: {
        label: "West · 心理映照 (Psychological reflection)",
        text: "Sun, Moon, rising, Saturn lessons, inner tension — read through Jungian archetypes as heart imagery.",
      },
      resonance: {
        label: "Resonance · 共振",
        text: "Only where East and West converge on high-confidence inner-world axes, giving restrained, non-deterministic words for growth.",
      },
    },
    disclaimer:
      "This product is a self-exploration tool for traditional culture and psychology. All readings are for self-reflection only and do not constitute medical, legal, financial, or psychological advice.",
    tg: {
      tagline: "Your chart is a mirror",
      entries: {
        calendar: { title: "Daily fortune", subtitle: "Daily flow · one push a day" },
        chart: { title: "My chart", subtitle: "命理 (Mingli) + psychological reading" },
        spirit: { title: "Spirit", subtitle: "Guardian spirit & yearly guidance" },
        reading: { title: "Cast chart", subtitle: "Birth info instant chart" },
        profiles: { title: "My profiles", subtitle: "Saved chart profiles" },
      },
    },
  },
  reading: {
    heroTitle1: "Tell me,",
    heroTitle2: "when you came into this world.",
    intro:
      "We instantly calculate your 八字 (Bazi), 紫微斗数 (Ziwei Doushu), and Western natal chart. Birthplace is used to correct 真太阳时 (True Solar Time); if birth time is unknown, the psychological (Western) layer will be omitted, showing only 命理 (Mingli).",
    disclaimerStart: "Birth information is sensitive personal data. Your chart is stored ",
    disclaimerHighlight: "in your private profile",
    disclaimerEnd:
      " (anonymous, device-isolated, visible only to you) and can be deleted anytime in Profiles. For self-reflection only.",
    nicknameLabel: "Name (optional)",
    nicknamePlaceholder: "How should I address you?",
    birthDateLabel: "Birth date",
    lunarCheckbox: "I entered the lunar calendar date",
    birthTimeLabel: "Birth time",
    timeKnownHint:
      "Birth time determines the hour pillar and rising sign; the more accurate, the better.",
    timeUnknownLabel: "Unknown birth time",
    timeUnknownHint:
      "The Western chart and psychological layer will be omitted, showing only 命理 (Mingli).",
    birthplaceLabel:
      "Birthplace (used to correct 真太阳时 (True Solar Time) and the Western chart)",
    birthplacePlaceholder: "Enter city/place, e.g. Shanghai, Beijing Chaoyang, New York",
    search: "Search",
    searching: "Searching…",
    reselect: "Change",
    geoCoords: "Lon {lon}° · Lat {lat}° · {timezone}",
    noBirthplaceHint:
      "Without a birthplace, 真太阳时 (True Solar Time) correction and the Western chart will be omitted.",
    genderLabel: "Gender",
    male: "Male",
    female: "Female",
    castMyChart: "Cast my chart",
    submit: "Cast my chart · Instant",
    submitting: "Casting your chart…",
    saveProfileError: "Failed to create profile: {message}",
    saveChartError: "Failed to save chart: {message}",
  },
  chart: {
    title: "命盘 (Chart)",
    loadingProfile: "Loading profile…",
    noProfile: "No chart profile yet.",
    goCast: "去起盘 (Cast chart) →",
    share: "分享 (Share) →",
    shareText: "照见 (Zhaojian) · Eastern astrology × Western psychology for self-reflection",
    todayFortune: "今日运势 (Today's fortune) →",

    baziTitle: "八字四柱 (BaZi Four Pillars)",
    ziweiTitle: "紫微斗数 (Zi Wei Dou Shu) · 十二宫 (Twelve Palaces)",
    westernTitle: "西方本命盘 (Western Natal Chart) · 心理映照 (Psychological Reflection)",
    westernMissing: "Missing birth time or place; the Western chart and psychological layer are omitted. Complete them to unlock.",
    readingTitle: "三段式解读 (Three-Part Reading)",

    castForMe: "为我照见 (Zhaojian for me)",
    generating: "正在为你照见 (Reflecting for you)…",
    generateReading: "为我照见 (Zhaojian for me) · 生成完整解读 (Generate full reading)",
    generateReadingSub: "Your chart is ready — read your core self, growth themes, and a word for this moment through 命理结构 (Mingli structure) + 深层心理 (depth psychology).",


    timelineTitle: "当下时序 (Current Cycles)",
    timelineDisclaimer: "Cycles are calculated by 大限 (Decade) / 流年 (Annual) flow for the current year ({year}), updated yearly. For self-reflection only, not event prediction.",

    pageDisclaimer: "The chart is computed once at profile creation and frozen. All readings are for self-reflection only and do not constitute medical, legal, financial, or psychological advice.",

    tabMingli: "命理 (Mingli)",
    tabPsych: "心理 (Psych)",
    tabResonance: "共振 (Resonance)",
    kickerMingli: "East · 命理结构 (Mingli Structure)",
    kickerPsych: "West · 心理映照 (Psychological Reflection)",
    kickerResonance: "Resonance · 共振",
    readingSaved: "This reading has been saved; return to Chart to view it again.",
    resonanceNote: "※ 仅在「内在世界 (inner world)」高置信锚点谈共振，非硬等价。",
    resonanceExampleChip: "福德宫 (Life Palace) ↔ 月亮 (Moon) · 土星 (Saturn)",

    pillarYear: "年 (Year)",
    pillarMonth: "月 (Month)",
    pillarDay: "日 (Day)",
    pillarHour: "时 (Hour)",
    dayMaster: "日主 (Day Master)",
    strength: "旺衰 (Strength)",
    fiveElements: "五行 (Five Elements)",
    strengthStrong: "身强 (Strong)",
    strengthWeak: "身弱 (Weak)",
    strengthBalanced: "中和 (Balanced)",
    strengthUnknown: "—",

    soulPalace: "命宫 (Life Palace)",
    bodyPalace: "身宫 (Body Palace)",
    fiveElementBureau: "五行局 (Five Element Bureau)",
    birthMutagens: "生年四化 (Natal Four Transforms)",
    bodyPalaceSuffix: "身 (Body)",

    radarAria: "五行雷达图 (Five Elements Radar)",
    missingCaption: "五行 (Five Elements) lacks {elements}; your favorable direction may lie here.",
    weakCaption: "{elements} is relatively weak; you may focus here.",

    elementWood: "木 (Wood)",
    elementFire: "火 (Fire)",
    elementEarth: "土 (Earth)",
    elementMetal: "金 (Metal)",
    elementWater: "水 (Water)",

    natalAria: "西方本命盘 (Western Natal Chart)",
    houseUnit: "{n}宫 (House)",

    selfPortraitTitle: "自我画像 (Self-Portrait)",
    selfPortraitSubtitle: "An inner profile synthesized from chart structure and self-reported traits.",
  },
  calendar: {
    title: "运势日历 (Fortune Calendar)",
    loadingProfile: "Loading profile…",
    noProfileForFortune:
      "No chart profile yet. Daily fortune cannot be generated.",
    goCast: "去起盘 (Cast chart)",
    dayMasterLabel: "命主 (Day Master)",
    today: "Today",
    calculating: "Casting today’s flow…",
    disclaimer:
      "Daily fortune is an inspirational reference of the day’s flow, not a prophecy of good or ill. Please judge with reality and reason.",

    decadal: "本限 (Decade)",
    yearly: "流年 (Annual flow)",
    yearlyJi: "流年化忌 (Annual Hua-Ji)",
    thisYearLesson: "今年功课 (This year’s lesson)",
    yearlyLu: "化禄 (Hua-Lu)",
    favorable: "顺势 (Favorable)",
    toTimeline: "本年时序 → (Current cycles →)",

    scoreLabel: "{grade} · {today}",
    moodLabel: "{today} · {mood}",
    grade: {
      auspicious: "吉 (Auspicious)",
      smooth: "顺 (Smooth)",
      neutral: "平 (Steady)",
      cautious: "谨 (Cautious)",
      advance: "宜进取 (Favorable for advancing)",
      proceed: "可推进 (Can push forward)",
      steady: "守稳健 (Stay steady)",
      still: "宜守静 (Favorable for stillness)",
    },

    yi: "宜 (Favorable)",
    ji: "忌 (Unfavorable)",
    favorableToday: "今日喜用 (Today’s favorables)",
    interaction: "流日{kind}命{withPillar}支 (Daily flow {kind} on {withPillar} branch)",
    todayYi: "今日宜 (Favorable today)",
    todayJi: "今日忌 (Unfavorable today)",
    auspiciousYi: "趋吉 · 宜 (Auspicious · Do)",
    cautionJi: "避祸 · 忌 (Avoid harm · Don’t)",

    almanac: "黄历 (Almanac)",
    none: "—",

    dims: {
      career: "事业 (Career)",
      wealth: "财运 (Wealth)",
      love: "感情 (Love)",
      health: "健康 (Health)",
      travel: "出行 (Travel)",
    },

    spiritCardLabel: "本命之灵 · 问今日 (Guardian Spirit · Ask Today)",
    spiritLoading: "本命之灵正在感应今日… (The guardian spirit is sensing today…)",
    talkToSpirit: "与本命之灵详谈 → (Talk to guardian spirit →)",

    weekDays: "Sun,Mon,Tue,Wed,Thu,Fri,Sat",
  },
  spirit: {
    notEnabled: "本命之灵 (Natal Spirit) is not enabled.",
    loadingProfile: "Loading profile…",
    noProfile: "No chart profile yet.",
    goCast: "去起盘 (Cast chart)",
    title: "本命之灵 (Natal Spirit)",
    subtitle:
      "The voice that walks out of your own chart — here to mirror you, not to prophesy.",
    disclaimer:
      "The 本命之灵 (Natal Spirit) converses based on your frozen chart; all content is for self-reflection only, not prediction or diagnosis.",

    send: "Send",
    writing: "本命之灵 (Natal Spirit) is writing…",
    unavailable: "本命之灵 (Natal Spirit) is temporarily unavailable",
    emptyPrompt: "Say something to your 本命之灵 (Natal Spirit)…",
    inputPlaceholder: "Talk to your 本命之灵 (Natal Spirit)…",

    archetypeAlt: "本命之灵 (Natal Spirit) · {archetype}",
    natalSpirit: "本命之灵 (Natal Spirit)",

    questionnaireTitle: "自我自陈 (Self-Report) · A few questions",
    questionnaireIntro:
      "A few subjective questions help your 本命之灵 (Natal Spirit) understand your state and tendencies. There are no right or wrong answers; they are only used to deepen the dialogue and portrait, not to calculate the chart.",
    saving: "Saving…",
    complete: "Complete · Help your 本命之灵 (Natal Spirit) understand you",
  },
};
