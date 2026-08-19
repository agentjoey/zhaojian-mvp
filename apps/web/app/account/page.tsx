"use client";

import Script from "next/script";
import { useEffect, useState, type ReactNode } from "react";
import { getWebUser, signInWithEmail, signOutWeb, upgradeAnonymousToEmail, supabase } from "@/lib/supabase";
import { hasTgSession, tgLoginWithWidget, tgLogout } from "@/lib/tg/client";
import { useIsTelegram } from "@/lib/tg/ui";
import { Paywall } from "@/components/Paywall";
import { PageHeader } from "@/components/PageHeader";
import { useT } from "@/lib/i18n/I18nProvider";
import { LocaleSwitch } from "@/lib/i18n/switch";

const TG_USERNAME_KEY = "zj_tg_username";

/** 信息分区：小标签 + 内容，区间 1px 细线（当代东方编辑式）。 */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="py-7" style={{ borderTop: "1px solid var(--color-line)" }}>
      <h2 className="mb-4 text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>
        {label}
      </h2>
      {children}
    </section>
  );
}

type ViewState =
  | { kind: "loading" }
  | { kind: "telegram"; username?: string | null }
  | { kind: "email"; email: string }
  | { kind: "anon"; user: { id: string; email: string | null; isAnonymous: boolean } | null };

type BillingStatus = {
  tier: string;
  memberUntil: string | null;
  used: number;
  free: number;
};

export default function AccountPage() {
  const t = useT();
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | { error: string }>("idle");
  const [mergeNotice, setMergeNotice] = useState<number | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [identities, setIdentities] = useState<{
    email: string | null;
    telegram: { username: string | null } | null;
  } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkEmailStatus, setLinkEmailStatus] = useState<
    "idle" | "sending" | "sent" | { error: string }
  >("idle");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteChecked, setDeleteChecked] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const inTg = useIsTelegram();

  useEffect(() => {
    async function resolve() {
      if (hasTgSession()) {
        // EP-account2-03：真正消费确认结果——hint cookie 只是「曾经登录过」的
        // 长效标记，不是「现在仍然有效」的证明。失效必须真的落到未登录态，
        // 不能假装还登录着（否则改名/绑邮箱/注销都会 401，用户却看不出为什么）。
        try {
          const res = await fetch("/api/tg/session", { credentials: "include" });
          const json = (await res.json().catch(() => null)) as { active: boolean } | null;
          if (!json?.active) {
            setView({ kind: "anon", user: null });
            return;
          }
        } catch {
          // 网络异常：保留原有「先信客户端 hint」的降级行为，避免离线时把
          // 已登录用户误判成未登录。
        }
        const username = typeof localStorage !== "undefined" ? localStorage.getItem(TG_USERNAME_KEY) : null;
        setView({ kind: "telegram", username });
        return;
      }
      const user = await getWebUser();
      if (user && user.email && !user.isAnonymous) {
        setView({ kind: "email", email: user.email });
      } else {
        setView({ kind: "anon", user });
      }
    }
    resolve();
  }, []);

  useEffect(() => {
    const n = sessionStorage.getItem("zj_merged");
    if (n) {
      setMergeNotice(Number(n));
      sessionStorage.removeItem("zj_merged");
    }
  }, []);

  // 已绑定身份
  useEffect(() => {
    if (view.kind !== "telegram" && view.kind !== "email") return;
    let cancelled = false;
    (async () => {
      try {
        const headers: Record<string, string> = {};
        const { data } = await supabase().auth.getSession();
        const token = data.session?.access_token;
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch("/api/account/identities", {
          credentials: "include",
          headers,
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          email: string | null;
          telegram: { username: string | null } | null;
        };
        if (!cancelled) setIdentities(json);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view.kind]);

  // 会员状态与本月额度
  useEffect(() => {
    if (view.kind === "loading") return;
    let cancelled = false;
    (async () => {
      try {
        const headers: Record<string, string> = {};
        const { data } = await supabase().auth.getSession();
        const token = data.session?.access_token;
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch("/api/billing/status", {
          credentials: "include",
          headers,
        });
        if (!res.ok) return;
        const json = (await res.json()) as BillingStatus;
        if (!cancelled) setBilling(json);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view.kind]);

  useEffect(() => {
    window.onTelegramAuth = (u) => {
      tgLoginWithWidget(u)
        .then((res) => {
          if (res?.merged > 0) {
            sessionStorage.setItem("zj_merged", String(res.merged));
          }
          if (u?.username && typeof localStorage !== "undefined") {
            localStorage.setItem(TG_USERNAME_KEY, String(u.username));
          }
          location.reload();
        })
        .catch(console.error);
    };
  }, []);

  useEffect(() => {
    window.onTelegramLink = async (u) => {
      try {
        setLinkError(null);
        const { data } = await supabase().auth.getSession();
        const token = data.session?.access_token;
        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch("/api/account/attach", {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({ kind: "telegram", ...u }),
        });
        if (res.status === 409) {
          setLinkError(t("account.tgAlreadyLinked"));
          return;
        }
        if (!res.ok) throw new Error(await res.text());
        location.reload();
      } catch (e) {
        console.error(e);
        setLinkError(t("account.linkFailed"));
      }
    };
  }, [t]);

  async function handleSendLink() {
    if (!email.includes("@")) {
      setStatus({ error: t("account.invalidEmail") });
      return;
    }
    setStatus("sending");
    const result = view.kind === "anon" && view.user?.isAnonymous ? await upgradeAnonymousToEmail(email) : await signInWithEmail(email);
    if (result.ok) {
      setStatus("sent");
    } else {
      setStatus({ error: result.error });
    }
  }

  async function handleLinkEmail() {
    const email = linkEmail.trim();
    if (!email.includes("@")) {
      setLinkEmailStatus({ error: t("account.invalidEmail") });
      return;
    }
    setLinkEmailStatus("sending");
    try {
      const res = await fetch("/api/account/attach", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "email", email }),
      });
      if (res.status === 409) {
        setLinkEmailStatus({ error: t("account.linkEmailInUse") });
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setLinkEmailStatus({ error: json.error || t("account.linkFailed") });
        return;
      }
      setLinkEmailStatus("sent");
    } catch {
      setLinkEmailStatus({ error: t("account.linkFailed") });
    }
  }

  async function handleDeleteAccount() {
    if (!deleteChecked) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      const { data } = await supabase().auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch("/api/account/delete", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setDeleteError(json.error || t("account.deleteFailed"));
        return;
      }
      await Promise.all([
        signOutWeb().catch(() => {}),
        tgLogout().catch(() => {}),
      ]);
      location.href = "/";
    } catch {
      setDeleteError(t("account.deleteFailed"));
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleLogout() {
    // Dual clear safety: if both TG and web traces exist, clear both before reload.
    const tgExists = hasTgSession();
    const webUser = await getWebUser().catch(() => null);
    const webExists = !!webUser && !!webUser.email && !webUser.isAnonymous;
    if (tgExists) await tgLogout().catch(() => {});
    if (webExists) await signOutWeb().catch(() => {});
    location.reload();
  }

  if (view.kind === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6" style={{ background: "var(--color-bg)" }}>
        <p style={{ color: "var(--color-muted)" }}>{t("common.loading")}</p>
      </main>
    );
  }

  const title =
    view.kind === "telegram"
      ? view.username
        ? `@${view.username}`
        : t("account.title")
      : view.kind === "email"
        ? view.email
        : t("account.saveYourZhaojian");
  const annotation = view.kind === "telegram" ? t("account.loggedInViaTelegram") : undefined;

  const primaryBtn = "w-full px-4 py-3 text-[14px] font-medium transition-colors disabled:opacity-60";
  const primaryStyle = {
    background: "var(--color-cinnabar)",
    color: "var(--color-paper)",
    borderRadius: "var(--radius-button)",
  };
  const inputCls =
    "w-full border bg-transparent px-4 py-3 text-[14px] outline-none transition-colors focus:border-[var(--color-cinnabar)]";
  const inputSt = {
    borderColor: "var(--color-line)",
    color: "var(--color-ink)",
    borderRadius: "var(--radius-button)",
  };

  const identitiesRows = (
    <>
      <div className="space-y-2 text-[13px]">
        <div className="flex items-center justify-between">
          <span style={{ color: "var(--color-muted)" }}>{t("account.email")}</span>
          <span style={{ color: "var(--color-ink)" }}>
            {identities?.email ?? t("account.notLinked")}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span style={{ color: "var(--color-muted)" }}>Telegram</span>
          <span style={{ color: "var(--color-ink)" }}>
            {identities?.telegram?.username ?? t("account.notLinked")}
          </span>
        </div>
      </div>
      {view.kind === "email" && !identities?.telegram && inTg && (
        <div className="mt-4 flex justify-center" id="tg-link-container">
          <Script
            src="https://telegram.org/js/telegram-widget.js?22"
            data-telegram-login="analyst_helen_bot"
            data-onauth="onTelegramLink(user)"
            data-request-access="write"
            strategy="afterInteractive"
          />
        </div>
      )}
      {linkError && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--color-cinnabar)" }}>
          {linkError}
        </p>
      )}
    </>
  );

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
      <PageHeader kicker={t("account.kicker")} title={title} annotation={annotation} />

      <div className="mt-6 flex items-center justify-between py-2">
        <span className="text-[13px]" style={{ color: "var(--color-ink)" }}>{t("account.language")}</span>
        <LocaleSwitch />
      </div>

      {mergeNotice !== null && (
        <div
          className="mt-2 px-4 py-3 text-[13px]"
          style={{
            background: "var(--color-tint)",
            color: "var(--color-cinnabar)",
            borderRadius: "var(--radius-chip)",
          }}
        >
          {t("account.mergedProfiles", { count: mergeNotice })}
        </div>
      )}

      {billing && (
        <Section label={t("account.sectionSubscription")}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-medium" style={{ color: "var(--color-ink)" }}>
                {billing.tier === "member" ? t("account.tierMember") : t("account.tierFree")}
              </p>
              {billing.tier === "member" && billing.memberUntil ? (
                <p className="text-[12px]" style={{ color: "var(--color-muted)" }}>
                  {t("account.expiresOn", { date: new Date(billing.memberUntil).toLocaleDateString("zh-CN") })}
                </p>
              ) : (
                <p className="text-[12px]" style={{ color: "var(--color-muted)" }}>
                  {t("account.usageThisMonth", { used: billing.used, free: billing.free })}
                </p>
              )}
            </div>
            {billing.tier !== "member" && (
              <button
                type="button"
                onClick={() => setShowPaywall(true)}
                className="px-4 py-2 text-[13px] font-medium transition-colors"
                style={{ background: "var(--color-cinnabar)", color: "var(--color-paper)", borderRadius: "var(--radius-button)" }}
              >
                {t("paywall.upgrade")}
              </button>
            )}
          </div>
          {showPaywall && (
            <div className="mt-4">
              <Paywall reason="quota" onClose={() => setShowPaywall(false)} />
            </div>
          )}
        </Section>
      )}

      {view.kind === "telegram" ? (
        <Section label={t("account.sectionBinding")}>
          {identitiesRows}
          {identities && identities.email === null && (
            <div className="mt-5 space-y-3">
              <label htmlFor="link-email" className="block text-[13px]" style={{ color: "var(--color-ink)" }}>
                {t("account.linkEmailLabel")}
              </label>
              <input
                id="link-email"
                type="email"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                placeholder="your@email.com"
                className={inputCls}
                style={inputSt}
                onKeyDown={(e) => e.key === "Enter" && handleLinkEmail()}
              />
              <button
                onClick={handleLinkEmail}
                disabled={linkEmailStatus === "sending"}
                className={primaryBtn}
                style={primaryStyle}
              >
                {linkEmailStatus === "sending" ? t("common.sending") : t("account.linkEmailLabel")}
              </button>
              {linkEmailStatus === "sent" && (
                <p className="text-[13px]" style={{ color: "var(--color-cinnabar)" }}>
                  {t("account.linkEmailSent")}
                </p>
              )}
              {typeof linkEmailStatus === "object" && "error" in linkEmailStatus && (
                <p className="text-[13px]" style={{ color: "var(--color-cinnabar)" }}>
                  {linkEmailStatus.error}
                </p>
              )}
            </div>
          )}
        </Section>
      ) : view.kind === "email" ? (
        <Section label={t("account.sectionBinding")}>
          {identitiesRows}
        </Section>
      ) : (
        <Section label={t("account.sectionLogin")}>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-muted)" }}>
            {t("account.anonymousDescription")}
          </p>

          <div className="mt-4 space-y-2">
            <label htmlFor="email" className="block text-[13px]" style={{ color: "var(--color-ink)" }}>
              {t("account.emailAddress")}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className={inputCls}
              style={inputSt}
              onKeyDown={(e) => e.key === "Enter" && handleSendLink()}
            />
          </div>

          <button
            onClick={handleSendLink}
            disabled={status === "sending"}
            className={`${primaryBtn} mt-4`}
            style={primaryStyle}
          >
            {status === "sending" ? t("common.sending") : t("account.sendMagicLink")}
          </button>

          {status === "sent" && (
            <p className="mt-3 text-[13px]" style={{ color: "var(--color-cinnabar)" }}>
              {t("account.magicLinkSent")}
            </p>
          )}
          {typeof status === "object" && "error" in status && (
            <p className="mt-3 text-[13px]" style={{ color: "var(--color-cinnabar)" }}>
              {status.error}
            </p>
          )}

          {inTg && (
            <div className="mt-4 flex justify-center" id="tg-login-container">
              {/* 换专属 bot 时改 data-telegram-login + BotFather /setdomain */}
              <Script
                src="https://telegram.org/js/telegram-widget.js?22"
                data-telegram-login="analyst_helen_bot"
                data-onauth="onTelegramAuth(user)"
                data-request-access="write"
                strategy="afterInteractive"
              />
            </div>
          )}
        </Section>
      )}

      {(view.kind === "telegram" || view.kind === "email") && (
        <Section label={t("account.sectionData")}>
          <div
            className="p-4"
            style={{
              border: "1px solid var(--color-cinnabar)",
              borderRadius: "var(--radius-card)",
            }}
          >
            <h3 className="mb-2 text-[13px] font-medium" style={{ color: "var(--color-cinnabar)" }}>
              {t("account.dangerZone")}
            </h3>
            <p className="mb-3 text-[12px] leading-relaxed" style={{ color: "var(--color-cinnabar)" }}>
              {t("account.deleteWarning")}
            </p>
            {!deleteOpen ? (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="w-full px-4 py-3 text-[13px] font-medium transition-colors"
                style={{
                  border: "1px solid var(--color-cinnabar)",
                  color: "var(--color-cinnabar)",
                  background: "transparent",
                  borderRadius: "var(--radius-button)",
                }}
              >
                {t("account.deleteAccount")}
              </button>
            ) : (
              <div className="space-y-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={deleteChecked}
                    onChange={(e) => setDeleteChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-cinnabar)]"
                  />
                  <span className="text-[12px] leading-relaxed" style={{ color: "var(--color-ink)" }}>
                    {t("account.deleteAcknowledge")}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={!deleteChecked || deleteLoading}
                  className="w-full px-4 py-3 text-[13px] font-medium transition-colors disabled:opacity-50"
                  style={primaryStyle}
                >
                  {deleteLoading ? t("account.deleting") : t("account.confirmDelete")}
                </button>
                {deleteError && (
                  <p className="text-[12px]" style={{ color: "var(--color-cinnabar)" }}>
                    {deleteError}
                  </p>
                )}
              </div>
            )}
          </div>
        </Section>
      )}

      {(view.kind === "telegram" || view.kind === "email") && (
        <div className="py-7" style={{ borderTop: "1px solid var(--color-line)" }}>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-3 text-[14px] font-medium transition-colors"
            style={{
              border: "1px solid var(--color-line)",
              color: "var(--color-ink)",
              background: "transparent",
              borderRadius: "var(--radius-button)",
            }}
          >
            {t("account.signOut")}
          </button>
        </div>
      )}
    </main>
  );
}
