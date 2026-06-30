"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { getWebUser, signInWithEmail, signOutWeb, upgradeAnonymousToEmail } from "@/lib/supabase";
import { tgLoginWithWidget } from "@/lib/tg/client";

export default function AccountPage() {
  const [user, setUser] = useState<{ id: string; email: string | null; isAnonymous: boolean } | null | undefined>(
    undefined,
  );
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | { error: string }>("idle");
  const [mergeNotice, setMergeNotice] = useState<number | null>(null);

  useEffect(() => {
    getWebUser().then(setUser);
  }, []);

  useEffect(() => {
    const n = sessionStorage.getItem("zj_merged");
    if (n) {
      setMergeNotice(Number(n));
      sessionStorage.removeItem("zj_merged");
    }
  }, []);

  useEffect(() => {
    (window as any).onTelegramAuth = (u: any) => {
      tgLoginWithWidget(u)
        .then((res) => {
          if (res?.merged > 0) {
            sessionStorage.setItem("zj_merged", String(res.merged));
          }
          location.reload();
        })
        .catch(console.error);
    };
  }, []);

  async function handleSendLink() {
    if (!email.includes("@")) {
      setStatus({ error: "请输入有效的邮箱地址" });
      return;
    }
    setStatus("sending");
    const result = user?.isAnonymous ? await upgradeAnonymousToEmail(email) : await signInWithEmail(email);
    if (result.ok) {
      setStatus("sent");
    } else {
      setStatus({ error: result.error });
    }
  }

  async function handleSignOut() {
    await signOutWeb();
    location.reload();
  }

  if (user === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6" style={{ background: "var(--color-bg)" }}>
        <p style={{ color: "var(--color-muted)" }}>加载中…</p>
      </main>
    );
  }

  const loggedInWithEmail = user && user.email && !user.isAnonymous;

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
          {loggedInWithEmail ? "账号" : "保存你的照见"}
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

        {loggedInWithEmail ? (
          <div className="space-y-6 text-center">
            <p style={{ color: "var(--color-ink)" }}>{user.email}</p>
            <button
              onClick={handleSignOut}
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
      </section>
    </main>
  );
}
