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
};
