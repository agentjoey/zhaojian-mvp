"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();

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
        登录中…
      </p>
    </main>
  );
}
