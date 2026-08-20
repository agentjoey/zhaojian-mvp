"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase, ANON_MERGE_TOKEN_KEY } from "@/lib/supabase";
import { useT } from "@/lib/i18n/I18nProvider";

export default function AuthCallbackPage() {
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    let cancelled = false;

    async function waitForSession() {
      const sb = supabase();
      for (let i = 0; i < 60; i++) {
        if (cancelled) return;
        const { data } = await sb.auth.getSession();
        if (data.session) {
          // 只有链接里带着绑定 nonce 时，这次点击才属于「绑定邮箱」流程；普通
          // 登录一律不碰绑定链路。
          //
          // ⚠️ 这里刻意**不**直接调 complete：绑定会把一个已验证邮箱移到另一个
          // 账号上，属于需要知情同意的动作。旧实现对每次成功登录无条件触发
          // complete，等于让「收到一封看起来像登录链接的信、顺手点开」就能完成
          // 一次账号变更。改为带 nonce 跳到 /account 的确认屏，由用户看清
          // 「把哪个邮箱绑到哪个账号」后显式确认。
          const bind = new URLSearchParams(window.location.search).get("bind");
          if (bind) {
            router.replace(`/account?bind=${encodeURIComponent(bind)}`);
            return;
          }
          // EP-account-login：换设备用已注册邮箱登录时，/account 的 handleSendLink
          // 在退回真正登录前存了这台设备的匿名 access token（见该函数注释）——这里
          // 认出新会话就是那次登录成功后拿到的，把匿名设备的数据合并进真正账号。
          // bind 分支不会走到这里（上面已经 return），两条流程互不干扰。
          const anonToken = localStorage.getItem(ANON_MERGE_TOKEN_KEY);
          if (anonToken) {
            localStorage.removeItem(ANON_MERGE_TOKEN_KEY);
            try {
              const res = await fetch("/api/account/merge-anon", {
                method: "POST",
                credentials: "include",
                headers: { "content-type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
                body: JSON.stringify({ anonAccessToken: anonToken }),
              });
              if (res.ok) {
                const merged = (await res.json().catch(() => ({ merged: 0 }))) as { merged: number };
                if (merged.merged > 0) sessionStorage.setItem("zj_merged", String(merged.merged));
              }
            } catch {
              // 合并失败不阻断登录本身——用户至少能进自己的账号，缺的只是这台
              // 设备上的匿名数据（同 TG 合并路径失败时的既有容错策略）。
            }
          }
          router.replace("/account");
          return;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      router.replace("/account");
    }

    waitForSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6" style={{ background: "var(--color-bg)" }}>
      <p className="text-lg" style={{ color: "var(--color-ink)" }}>
        {t("common.signingIn")}
      </p>
    </main>
  );
}
