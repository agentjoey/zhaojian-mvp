"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { getWebUser, signInWithEmail, signOutWeb, upgradeAnonymousToEmail, supabase } from "@/lib/supabase";
import { hasTgSession, tgLoginWithWidget, tgLogout } from "@/lib/tg/client";
import { Paywall } from "@/components/Paywall";

const TG_USERNAME_KEY = "zj_tg_username";

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

  useEffect(() => {
    async function resolve() {
      if (hasTgSession()) {
        // Optional: confirm the server-side TG session is still active.
        try {
          await fetch("/api/tg/session", { credentials: "include" });
        } catch {
          // Ignore confirmation failures; keep TG state based on client hint.
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
    (window as any).onTelegramAuth = (u: any) => {
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
    (window as any).onTelegramLink = async (u: any) => {
      try {
        setLinkError(null);
        const { data } = await supabase().auth.getSession();
        const token = data.session?.access_token;
        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch("/api/account/link-telegram", {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify(u),
        });
        if (res.status === 409) {
          setLinkError("该 Telegram 已绑定其他账号，请改用登录并合并");
          return;
        }
        if (!res.ok) throw new Error(await res.text());
        location.reload();
      } catch (e) {
        console.error(e);
        setLinkError("绑定失败，请重试");
      }
    };
  }, []);

  async function handleSendLink() {
    if (!email.includes("@")) {
      setStatus({ error: "请输入有效的邮箱地址" });
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
      setLinkEmailStatus({ error: "请输入有效的邮箱地址" });
      return;
    }
    setLinkEmailStatus("sending");
    try {
      const res = await fetch("/api/account/link-email", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 409) {
        setLinkEmailStatus({ error: "该邮箱已被占用" });
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setLinkEmailStatus({ error: json.error || "绑定失败，请重试" });
        return;
      }
      setLinkEmailStatus("sent");
    } catch {
      setLinkEmailStatus({ error: "绑定失败，请重试" });
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
        setDeleteError(json.error || "注销失败，请重试");
        return;
      }
      await Promise.all([
        signOutWeb().catch(() => {}),
        tgLogout().catch(() => {}),
      ]);
      location.href = "/";
    } catch {
      setDeleteError("注销失败，请重试");
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
        <p style={{ color: "var(--color-muted)" }}>加载中…</p>
      </main>
    );
  }

  const identitiesSection = (
    <div
      className="mb-6 rounded-xl p-4 text-left"
      style={{
        background: "var(--color-paper)",
        border: "1px solid var(--color-line)",
      }}
    >
      <h2
        className="mb-3 text-sm font-medium"
        style={{ color: "var(--color-ink)" }}
      >
        已绑定
      </h2>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span style={{ color: "var(--color-muted)" }}>邮箱</span>
          <span style={{ color: "var(--color-ink)" }}>
            {identities?.email ?? "未绑定"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span style={{ color: "var(--color-muted)" }}>Telegram</span>
          <span style={{ color: "var(--color-ink)" }}>
            {identities?.telegram?.username ?? "未绑定"}
          </span>
        </div>
      </div>
      {view.kind === "email" && !identities?.telegram && (
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
        <p
          className="mt-3 text-center text-sm"
          style={{ color: "var(--color-cinnabar)" }}
        >
          {linkError}
        </p>
      )}
    </div>
  );

  const title =
    view.kind === "email" || view.kind === "telegram" ? "账号" : "保存你的照见";

  return (
    <main className="flex min-h-screen items-start justify-center p-6 pt-24" style={{ background: "var(--color-bg)" }}>
      <section
        className="w-full max-w-md rounded-2xl p-8 shadow-sm"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-line)",
        }}
      >
        <h1
          className="mb-3 text-center text-2xl font-semibold"
          style={{ fontFamily: "var(--font-serif)", color: "var(--color-ink)" }}
        >
          {title}
        </h1>

        {mergeNotice !== null && (
          <div
            className="mb-4 rounded-xl px-4 py-3 text-center text-sm"
            style={{
              background: "rgba(224, 78, 57, 0.12)",
              color: "var(--color-cinnabar)",
            }}
          >
            已合并 {mergeNotice} 个本地档案到你的账号
          </div>
        )}

        {billing && (
          <div
            className="mb-6 rounded-xl p-4"
            style={{
              background: "var(--color-paper)",
              border: "1px solid var(--color-line)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                  {billing.tier === "member" ? "会员" : "免费"}
                </p>
                {billing.tier === "member" && billing.memberUntil ? (
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                    到期 {new Date(billing.memberUntil).toLocaleDateString("zh-CN")}
                  </p>
                ) : (
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                    本月已用 {billing.used}/{billing.free}
                  </p>
                )}
              </div>
              {billing.tier !== "member" && (
                <button
                  type="button"
                  onClick={() => setShowPaywall(true)}
                  className="rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.98]"
                  style={{ background: "var(--color-cinnabar)", color: "#fff" }}
                >
                  升级会员
                </button>
              )}
            </div>
            {showPaywall && (
              <div className="mt-4">
                <Paywall reason="quota" onClose={() => setShowPaywall(false)} />
              </div>
            )}
          </div>
        )}

        {view.kind === "telegram" ? (
          <div className="space-y-6 text-center">
            {identitiesSection}
            {identities && identities.email === null && (
              <div className="space-y-3 text-left">
                <label htmlFor="link-email" className="block text-sm" style={{ color: "var(--color-ink)" }}>
                  绑定邮箱
                </label>
                <input
                  id="link-email"
                  type="email"
                  value={linkEmail}
                  onChange={(e) => setLinkEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full rounded-xl border bg-transparent px-4 py-3 outline-none transition focus:ring-2"
                  style={{
                    borderColor: "var(--color-line)",
                    color: "var(--color-ink)",
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleLinkEmail()}
                />
                <button
                  onClick={handleLinkEmail}
                  disabled={linkEmailStatus === "sending"}
                  className="w-full rounded-xl px-4 py-3 font-medium transition active:scale-[0.98] disabled:opacity-60"
                  style={{
                    background: "var(--color-cinnabar)",
                    color: "#fff",
                  }}
                >
                  {linkEmailStatus === "sending" ? "发送中…" : "绑定邮箱"}
                </button>
                {linkEmailStatus === "sent" && (
                  <p className="text-center text-sm" style={{ color: "var(--color-cinnabar)" }}>
                    确认邮件已发送，请查收后点击链接完成绑定
                  </p>
                )}
                {typeof linkEmailStatus === "object" && "error" in linkEmailStatus && (
                  <p className="text-center text-sm" style={{ color: "var(--color-cinnabar)" }}>
                    {linkEmailStatus.error}
                  </p>
                )}
              </div>
            )}
            <p style={{ color: "var(--color-ink)" }}>
              已通过 Telegram 登录
              {view.username ? `（${view.username}）` : null}
            </p>
            <button
              onClick={handleLogout}
              className="w-full rounded-xl px-4 py-3 font-medium transition active:scale-[0.98]"
              style={{
                background: "var(--color-cinnabar)",
                color: "#fff",
              }}
            >
              登出
            </button>
          </div>
        ) : view.kind === "email" ? (
          <div className="space-y-6 text-center">
            {identitiesSection}
            <p style={{ color: "var(--color-ink)" }}>{view.email}</p>
            <button
              onClick={handleLogout}
              className="w-full rounded-xl px-4 py-3 font-medium transition active:scale-[0.98]"
              style={{
                background: "var(--color-cinnabar)",
                color: "#fff",
              }}
            >
              登出
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-center text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
              当前为本地匿名模式，登录后可在不同设备间同步你的档案与解读记录。
            </p>

            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm" style={{ color: "var(--color-ink)" }}>
                邮箱地址
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full rounded-xl border bg-transparent px-4 py-3 outline-none transition focus:ring-2"
                style={{
                  borderColor: "var(--color-line)",
                  color: "var(--color-ink)",
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSendLink()}
              />
            </div>

            <button
              onClick={handleSendLink}
              disabled={status === "sending"}
              className="w-full rounded-xl px-4 py-3 font-medium transition active:scale-[0.98] disabled:opacity-60"
              style={{
                background: "var(--color-cinnabar)",
                color: "#fff",
              }}
            >
              {status === "sending" ? "发送中…" : "发送登录链接"}
            </button>

            {status === "sent" && (
              <p className="text-center text-sm" style={{ color: "var(--color-cinnabar)" }}>
                已发送，请查收邮件中的登录链接
              </p>
            )}
            {typeof status === "object" && "error" in status && (
              <p className="text-center text-sm" style={{ color: "var(--color-cinnabar)" }}>
                {status.error}
              </p>
            )}

            {/* 换专属 bot 时改 data-telegram-login + BotFather /setdomain */}
            <div className="flex justify-center pt-2" id="tg-login-container">
              <Script
                src="https://telegram.org/js/telegram-widget.js?22"
                data-telegram-login="analyst_helen_bot"
                data-onauth="onTelegramAuth(user)"
                data-request-access="write"
                strategy="afterInteractive"
              />
            </div>
          </div>
        )}

        {(view.kind === "telegram" || view.kind === "email") && (
          <div
            className="mt-8 rounded-xl p-4"
            style={{
              background: "rgba(224, 78, 57, 0.08)",
              border: "1px solid var(--color-cinnabar)",
            }}
          >
            <h2
              className="mb-2 text-sm font-medium"
              style={{ color: "var(--color-cinnabar)" }}
            >
              危险区 · 注销账号
            </h2>
            <p className="mb-3 text-xs leading-relaxed" style={{ color: "var(--color-cinnabar)" }}>
              此操作不可逆。注销后，你的账号、所有档案、对话记录、会员权益与 Telegram
              绑定将被永久删除，无法恢复。
            </p>
            {!deleteOpen ? (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="w-full rounded-xl border px-4 py-3 text-sm font-medium transition active:scale-[0.98]"
                style={{
                  borderColor: "var(--color-cinnabar)",
                  color: "var(--color-cinnabar)",
                  background: "transparent",
                }}
              >
                注销账号
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
                  <span className="text-xs leading-relaxed" style={{ color: "var(--color-ink)" }}>
                    我明白此操作不可逆，将永久删除我的所有档案与数据
                  </span>
                </label>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={!deleteChecked || deleteLoading}
                  className="w-full rounded-xl px-4 py-3 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50"
                  style={{
                    background: "var(--color-cinnabar)",
                    color: "#fff",
                  }}
                >
                  {deleteLoading ? "注销中…" : "确认注销"}
                </button>
                {deleteError && (
                  <p className="text-center text-xs" style={{ color: "var(--color-cinnabar)" }}>
                    {deleteError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
