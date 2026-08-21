"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatQuestionnaire } from "@eamvp/core";
import { getActiveProfile, getSpiritMemory, saveSpiritMemory, getQuestionnaire, type Profile } from "@/lib/profiles";
import { listDreamHistory, appendDreamHistory, type DreamHistoryEntry } from "@/lib/dream-history";
import { hasTgSession, tgGetProfile, tgListDreamHistory } from "@/lib/tg/client";
import { supabase } from "@/lib/supabase";
import { useIsTelegram, useTgMainButton, haptics } from "@/lib/tg/ui";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui";
import { CastingOverlay } from "@/components/CastingOverlay";
import { useT, useLocale } from "@/lib/i18n/I18nProvider";
import { spiritMemoryAction, dreamSummaryAction } from "@/app/actions";

// 与 fengshui/page.tsx、spirit/page.tsx 同一模式：模块加载时求值（测试须
// resetModules + 动态 import 才能切 flag，见 __tests__/page.test.tsx 顶部注释）。
// API 层（/api/spirit/dream、/api/tg/dream）另有 404 闸门，这里是页面级「不可达」。
const ENABLED = process.env.NEXT_PUBLIC_DREAM_ENABLED === "1";

// EP-auth-return：撞见 needLogin 后离开这页去登录，回来（甚至只是手动导航回来）
// 时刚打的字不能没了——用 sessionStorage 兜底草稿，纯 useState 撑不过页面卸载。
const DREAM_DRAFT_KEY = "zj_dream_draft";

type Turn = { role: "user" | "spirit"; content: string };

export default function DreamPage() {
  const t = useT();
  const { locale } = useLocale();
  const inTg = useIsTelegram();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  // input 是共用输入框：turns 为空时它是「梦原文」，turns 非空时它是「追问」。
  // 初值从 sessionStorage 兜底草稿读回（见 DREAM_DRAFT_KEY 上方注释）。
  const [input, setInputState] = useState(() => (typeof window !== "undefined" ? sessionStorage.getItem(DREAM_DRAFT_KEY) ?? "" : ""));
  function setInput(value: string) {
    setInputState(value);
    sessionStorage.setItem(DREAM_DRAFT_KEY, value);
  }
  const [turns, setTurns] = useState<Turn[]>([]);
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
  // EP-dream-history：最近 10 条摘要（不含梦原文，见 summarizeDreamEntry）。
  const [history, setHistory] = useState<DreamHistoryEntry[]>([]);

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

  // 历史列表独立一个 effect、独立 try/catch：加载失败只留空列表，不影响上面主流程
  // （档案/记忆/问卷）——历史是锦上添花，不是解梦本身的前置条件。
  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        const h = hasTgSession() ? await tgListDreamHistory() : await listDreamHistory(profile.id);
        setHistory(h);
      } catch {
        // 保持空列表
      }
    })();
  }, [profile]);

  const isFollowUp = turns.length > 0;
  // EP-dream-history-2：turns[0] 的角色天然区分两种追问场景——同一次会话里的追问
  // 首轮是用户打的梦（role "user"）；点历史条目续接进来的首轮是灵存下的解读全文
  // （role "spirit"，见 history 列表的 onClick）。据此决定要不要重建梦原文。
  const resumedFromHistory = isFollowUp && turns[0]!.role === "spirit";
  const tooLong = input.trim().length > 2000;
  const canSubmit = !!profile && input.trim().length >= 4 && !tooLong && !pending;

  async function submit() {
    if (!profile || !canSubmit) return;
    const text = input.trim();
    const dreamText = isFollowUp ? (resumedFromHistory ? undefined : turns[0]!.content) : text;
    setPending(true);
    setError(null);
    setNeedLogin(false);
    haptics.light();
    const inTgSession = hasTgSession();
    try {
      let res: Response;
      const payload: Record<string, unknown> = {};
      if (dreamText !== undefined) payload.dream = dreamText;
      if (isFollowUp) {
        payload.followUp = text;
        // 同一会话追问：priorTurns 不含首轮梦原文——首轮由 dream 单独重建。
        // 续接历史：没有梦原文可单独重建，priorTurns 直接是完整 turns（[0] 是历史解读）。
        payload.priorTurns = resumedFromHistory ? turns : turns.slice(1);
      }
      if (inTgSession) {
        res = await fetch("/api/tg/dream", { method: "POST", headers: { "x-zj-locale": locale }, body: JSON.stringify(payload) });
      } else {
        // EP-account2 阻断 3：/api/spirit/dream 硬要求 Bearer（路由已改，客户端必须跟上），
        // 取法与 SpiritPanel/fengshui 一致——supabase 会话的 access_token，与 x-zj-locale 共存。
        const { data: sessionData } = await supabase().auth.getSession();
        const token = sessionData.session?.access_token;
        res = await fetch("/api/spirit/dream", {
          method: "POST",
          headers: { "x-zj-locale": locale, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ ...payload, chart: profile.chart, memory: memory ?? undefined, questionnaire }),
        });
      }
      if (!res.ok) {
        if (res.status === 401 && !inTgSession) {
          setNeedLogin(true);
          return;
        }
        throw new Error(await res.text());
      }
      const replyText = await res.text();
      const newTurns: Turn[] = isFollowUp
        ? [...turns, { role: "user", content: text }, { role: "spirit", content: replyText }]
        : [{ role: "user", content: text }, { role: "spirit", content: replyText }];
      setTurns(newTurns);
      setInput("");
      haptics.success();
      // TG 臂的记忆提炼/历史摘要在服务端 api/tg/dream 内 fire-and-forget 完成（无浏览器侧
      // Supabase 会话，客户端写不了）；web 臂同 SpiritPanel 模式，客户端提炼+写回。
      if (!inTgSession) {
        spiritMemoryAction(newTurns, memory ?? undefined).then((m) => {
          if (m) {
            setMemory(m);
            void saveSpiritMemory(profile.id, m);
          }
        });
        // 历史摘要只在首次解读后写一条——追问是同一次解梦会话的延续，不产生新的列表条目。
        if (!isFollowUp) {
          dreamSummaryAction(dreamText as string, replyText, locale).then((summary) => {
            if (!summary) return;
            void appendDreamHistory(profile.id, summary, replyText).then(() => listDreamHistory(profile.id).then(setHistory));
          });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  // flag 关闭时 TG MainButton 也必须隐藏（visible: inTg && ENABLED）——页面级 notEnabled
  // 早退只挡渲染，挡不住这个 hook 把「解梦」按钮挂上 TG 原生栏（验收跟进 3）。
  useTgMainButton({
    text: pending ? t("dream.interpreting") : isFollowUp ? t("dream.followUpSubmit") : t("dream.submit"),
    onClick: submit,
    enabled: canSubmit,
    visible: inTg && ENABLED,
  });

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
      {/* EP-motion：解梦是 buffered 调用（sanitizeDream 需要完整文本，见 spec §4），
          等待期间此前是零反馈——不像 chart 的解读有渐进流式文字打底。用 CastingOverlay
          兜底这段秒级空等，gan/zhi 复用命主日柱（与 fengshui 同一「锚人」思路，不是
          真的在起一份新盘）。 */}
      {pending && (
        <CastingOverlay
          gan={profile.chart.bazi.pillars.day.stem}
          zhi={profile.chart.bazi.pillars.day.branch}
          seal="梦"
          title={t("dream.castingTitle")}
        />
      )}
      <PageHeader kicker={t("dream.kicker")} title={t("dream.title")} annotation={t("dream.subtitle")} />
      <div className="mt-6">
        {turns.length === 0 && (
          <>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("dream.placeholder")}
              rows={5}
              className="w-full resize-none bg-transparent p-4 text-[15px] leading-[1.9] outline-none focus:border-[var(--color-line-strong)]"
              style={{ border: "1px solid var(--color-line)", borderRadius: "var(--radius-card)", color: "var(--color-ink)" }}
            />
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
              <span>{tooLong ? t("dream.errorTooLong") : ""}</span>
              <span className="font-latin">{input.trim().length}/2000</span>
            </div>
          </>
        )}

        {!inTg && (
          <div className="mt-4">
            {turns.length === 0 ? (
              <Button onClick={submit} disabled={!canSubmit}>
                {pending ? t("dream.interpreting") : t("dream.submit")}
              </Button>
            ) : null}
          </div>
        )}

        {needLogin && (
          <div className="mt-4 px-4 py-3 text-[13px]" style={{ borderRadius: "var(--radius-card)", background: "var(--color-error-bg)", color: "var(--color-seal)", border: "1px solid var(--color-error-line)" }}>
            {t("dream.needLogin")}
            <Link href="/account?next=/dream" className="ml-2 underline underline-offset-4" style={{ color: "var(--color-cinnabar)" }}>
              {t("dream.needLoginCta")} →
            </Link>
          </div>
        )}
        {error && (
          <div className="mt-4 px-4 py-3 text-[13px]" style={{ borderRadius: "var(--radius-card)", background: "var(--color-error-bg)", color: "var(--color-seal)", border: "1px solid var(--color-error-line)" }}>
            {error}
          </div>
        )}

        {turns.length > 0 && (
          <div className="zj-rise mt-8 space-y-5 pt-6" style={{ borderTop: "1px solid var(--color-line)" }}>
            {turns.map((turn, i) => (
              <div key={i}>
                <div className="text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>
                  {turn.role === "user" ? t("dream.youSaid") : t("dream.kicker")}
                </div>
                <p className="reading-prose mt-2 whitespace-pre-wrap">{turn.content}</p>
              </div>
            ))}
          </div>
        )}

        {turns.length > 0 && (
          <div className="mt-6">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("dream.followUpPlaceholder")}
              rows={3}
              className="w-full resize-none bg-transparent p-4 text-[15px] leading-[1.9] outline-none focus:border-[var(--color-line-strong)]"
              style={{ border: "1px solid var(--color-line)", borderRadius: "var(--radius-card)", color: "var(--color-ink)" }}
            />
            {!inTg && (
              <div className="mt-3">
                <Button onClick={submit} disabled={!canSubmit}>
                  {pending ? t("dream.interpreting") : t("dream.followUpSubmit")}
                </Button>
              </div>
            )}
          </div>
        )}

        {turns.length === 0 && history.length > 0 && (
          <div className="mt-10 pt-6" style={{ borderTop: "1px solid var(--color-line)" }}>
            <div className="text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>{t("dream.historyTitle")}</div>
            <ul className="mt-3 space-y-2.5">
              {history.map((h) =>
                h.fullText ? (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => {
                        // EP-dream-history-2：turns[0] 是历史里存的解读全文（role
                        // "spirit"）——resumedFromHistory 据此识别，submit() 走
                        // 「续接历史」分支（不重建梦原文，priorTurns 直接是 turns）。
                        setTurns([{ role: "spirit", content: h.fullText! }]);
                        setInput("");
                      }}
                      className="block w-full text-left text-[13px] leading-relaxed text-ink-2 underline decoration-[var(--color-line)] underline-offset-4 transition-colors hover:text-ink hover:decoration-[var(--color-cinnabar)]"
                    >
                      {h.summary}
                    </button>
                  </li>
                ) : (
                  // 迁移 0018 之前写入的旧行没有 full_text，续接功能对它降级不可用——
                  // 只当摘要展示，不做成看起来能点的样子。
                  <li key={h.id} className="text-[13px] leading-relaxed text-ink-2">{h.summary}</li>
                ),
              )}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
