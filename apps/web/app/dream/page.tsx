"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatQuestionnaire } from "@eamvp/core";
import { getActiveProfile, getSpiritMemory, saveSpiritMemory, getQuestionnaire, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { supabase } from "@/lib/supabase";
import { useIsTelegram, useTgMainButton, haptics } from "@/lib/tg/ui";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui";
import { useT, useLocale } from "@/lib/i18n/I18nProvider";
import { spiritMemoryAction } from "@/app/actions";

// 与 fengshui/page.tsx、spirit/page.tsx 同一模式：模块加载时求值（测试须
// resetModules + 动态 import 才能切 flag，见 __tests__/page.test.tsx 顶部注释）。
// API 层（/api/spirit/dream、/api/tg/dream）另有 404 闸门，这里是页面级「不可达」。
const ENABLED = process.env.NEXT_PUBLIC_DREAM_ENABLED === "1";

export default function DreamPage() {
  const t = useT();
  const { locale } = useLocale();
  const inTg = useIsTelegram();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [dream, setDream] = useState("");
  const [reading, setReading] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // EP-account2 阻断 3：web 臂 fetch 补 Authorization Bearer 后，匿名/会话失效
  // 用户会拿到 401——不能按通用错误把服务端裸字符串（"未登录"）扔给用户，
  // 给一个引导态（参考 dream.noProfile 的既有处理）。
  const [needLogin, setNeedLogin] = useState(false);
  // 关系记忆/问卷仅 web 臂客户端取（同 SpiritPanel 模式）——TG 臂由服务端 api/tg/dream
  // 自己读取 profile 关联的记忆，客户端不需要也拿不到（无浏览器侧 Supabase 会话）。
  const [memory, setMemory] = useState<string | null>(null);
  const [questionnaire, setQuestionnaire] = useState<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        if (hasTgSession()) {
          setProfile(await tgGetProfile());
          return;
        }
        const p = await getActiveProfile();
        setProfile(p);
        if (p) {
          const [mem, qa] = await Promise.all([getSpiritMemory(p.id), getQuestionnaire(p.id)]);
          setMemory(mem);
          setQuestionnaire(qa ? formatQuestionnaire(qa) : undefined);
        }
      } catch {
        setProfile(null);
      }
    })();
  }, []);

  const tooLong = dream.trim().length > 2000;
  const canSubmit = !!profile && dream.trim().length >= 4 && !tooLong && !pending;

  async function submit() {
    if (!profile || !canSubmit) return;
    setPending(true);
    setError(null);
    setNeedLogin(false);
    setReading(null);
    haptics.light();
    const inTgSession = hasTgSession();
    try {
      let res: Response;
      if (inTgSession) {
        res = await fetch("/api/tg/dream", { method: "POST", headers: { "x-zj-locale": locale }, body: JSON.stringify({ dream }) });
      } else {
        // EP-account2 阻断 3：/api/spirit/dream 硬要求 Bearer（路由已改，客户端必须跟上），
        // 取法与 SpiritPanel/fengshui 一致——supabase 会话的 access_token，与 x-zj-locale 共存。
        const { data: sessionData } = await supabase().auth.getSession();
        const token = sessionData.session?.access_token;
        res = await fetch("/api/spirit/dream", {
          method: "POST",
          headers: { "x-zj-locale": locale, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ chart: profile.chart, dream, memory: memory ?? undefined, questionnaire }),
        });
      }
      if (!res.ok) {
        if (res.status === 401 && !inTgSession) {
          setNeedLogin(true);
          return;
        }
        throw new Error(await res.text());
      }
      const text = await res.text();
      setReading(text);
      haptics.success();
      // TG 臂的记忆提炼在服务端 api/tg/dream 内 fire-and-forget 完成（无浏览器侧
      // Supabase 会话，客户端写不了）；web 臂同 SpiritPanel 模式，客户端提炼+写回。
      if (!inTgSession) {
        spiritMemoryAction(
          [
            { role: "user", content: dream },
            { role: "spirit", content: text },
          ],
          memory ?? undefined,
        ).then((m) => {
          if (m) {
            setMemory(m);
            void saveSpiritMemory(profile.id, m);
          }
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  // flag 关闭时 TG MainButton 也必须隐藏（visible: inTg && ENABLED）——页面级 notEnabled
  // 早退只挡渲染，挡不住这个 hook 把「解梦」按钮挂上 TG 原生栏（验收跟进 3）。
  useTgMainButton({ text: pending ? t("dream.interpreting") : t("dream.submit"), onClick: submit, enabled: canSubmit, visible: inTg && ENABLED });

  // 必须排在所有 hook 之后（与 profile 早退同区），不得跳过任何 hook 调用。
  if (!ENABLED)
    return (
      <main className="mx-auto max-w-[720px] px-4 py-10">
        <p className="text-ink-2">{t("dream.notEnabled")}</p>
      </main>
    );
  if (profile === undefined) return null;
  if (profile === null)
    return (
      <main className="mx-auto max-w-[720px] px-4 py-10">
        <PageHeader kicker={t("dream.kicker")} title={t("dream.title")} />
        <p className="mt-6 text-[14px] text-ink-2">{t("dream.noProfile")}</p>
        <Link href="/reading" className="mt-4 inline-block text-[13px] underline underline-offset-4" style={{ color: "var(--color-cinnabar)" }}>
          {t("reading.kicker")} →
        </Link>
      </main>
    );

  return (
    <main className="mx-auto max-w-[720px] px-4 pb-8 pt-6">
      <PageHeader kicker={t("dream.kicker")} title={t("dream.title")} annotation={t("dream.subtitle")} />
      <div className="mt-6">
        <textarea
          value={dream}
          onChange={(e) => setDream(e.target.value)}
          placeholder={t("dream.placeholder")}
          rows={5}
          className="w-full resize-none bg-transparent p-4 text-[15px] leading-[1.9] outline-none focus:border-[var(--color-line-strong)]"
          style={{ border: "1px solid var(--color-line)", borderRadius: "var(--radius-card)", color: "var(--color-ink)" }}
        />
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
          <span>{tooLong ? t("dream.errorTooLong") : ""}</span>
          <span className="font-latin">{dream.trim().length}/2000</span>
        </div>
        {!inTg && (
          <div className="mt-4">
            <Button onClick={submit} disabled={!canSubmit}>
              {pending ? t("dream.interpreting") : t("dream.submit")}
            </Button>
          </div>
        )}
        {needLogin && (
          <div className="mt-4 px-4 py-3 text-[13px]" style={{ borderRadius: "var(--radius-card)", background: "var(--color-error-bg)", color: "var(--color-seal)", border: "1px solid var(--color-error-line)" }}>
            {t("dream.needLogin")}
            <Link href="/account" className="ml-2 underline underline-offset-4" style={{ color: "var(--color-cinnabar)" }}>
              {t("dream.needLoginCta")} →
            </Link>
          </div>
        )}
        {error && (
          <div className="mt-4 px-4 py-3 text-[13px]" style={{ borderRadius: "var(--radius-card)", background: "var(--color-error-bg)", color: "var(--color-seal)", border: "1px solid var(--color-error-line)" }}>
            {error}
          </div>
        )}
        {reading && (
          <div className="zj-rise mt-8 pt-6" style={{ borderTop: "1px solid var(--color-line)" }}>
            <div className="text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>{t("dream.kicker")}</div>
            <p className="reading-prose mt-3 whitespace-pre-wrap">{reading}</p>
          </div>
        )}
      </div>
    </main>
  );
}
