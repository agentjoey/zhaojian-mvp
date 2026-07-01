"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
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
