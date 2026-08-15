"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { computeFengshui, FENGSHUI_ENGINE_VERSION, type FengshuiChart } from "@eamvp/core";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { useT, useLocale } from "@/lib/i18n/I18nProvider";
import { BaguaWheel } from "@/components/charts/BaguaWheel";
import { Markdown } from "@/components/Markdown";
import { Card } from "@/components/ui";
import {
  fengshuiCacheKey, readFengshuiCache, writeFengshuiCache, type FengshuiSections,
} from "@/lib/fengshui-cache";

const ENABLED = process.env.NEXT_PUBLIC_FENGSHUI_ENABLED === "1";

/**
 * 叙述分节的标题键。**不要借用 directionsTitle / affinityTitle** ——
 * 那两个描述的是下方确定性区块（八方吉凶、宜用色与材），与叙述分节语义不同。
 * 本页只渲染前两节：第三节「可做的事」由下方确定性化解清单承担，
 * 它带成本分级与传统/现代对照，比叙述版更有信息量。
 */
const SECTION_HEADING_KEY = {
  situation: "fengshui.narrativeSections.situation",
  youAndSpace: "fengshui.narrativeSections.youAndSpace",
} as const;

/**
 * 「境」页（EP-fs-07）。骨架——命卦、八方盘、化解清单——全部确定性计算，
 * 与 LLM 无关、永远可得；叙述层由 LLM 生成，是唯一会失败/降级的部分。
 * 两档降级路径都不留白页，只在骨架旁边加一行可见提示 + 重试入口：
 *   1. failed  —— 请求本身失败（网络/超时/非 2xx）：没有叙述可显示。
 *   2. degraded —— 请求成功，但 generateFengshuiReading 判定模型说错过
 *      确定性事实（方位↔星名对不上），已被机械纠正。纠正只救得回星名，
 *      救不回建立在错方位上的整段叙述，所以不能把它当正常结果直接渲染
 *      （见 @eamvp/llm 的 FengshuiReading.degraded 文档）；也不写入缓存，
 *      避免一份带瑕疵的报告被永久复用。
 *
 * Task 14 复审必修1：route 返回 JSON（`{ sections, degraded }`），页面按三个分节
 * （situation/youAndSpace/actions）渲染，每节标题走 i18n、样式与页面其余 H2 一致；
 * 不再把整段 markdown（含字面 `## ` 标题行）整体丢给 <Markdown> 渲染。
 * `actions` 分节复用「可做的事」标题、直接接在确定性化解清单的同一个标题下面
 * （叙述先给一段自然语言小结，紧接着是清单本身）——避免「可做的事」这个标题在
 * 页面上出现两次。
 */
export default function FengshuiPage() {
  const t = useT();
  const { locale } = useLocale();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [sections, setSections] = useState<FengshuiSections | null>(null);
  const [failed, setFailed] = useState(false);
  const [degraded, setDegraded] = useState(false);
  // 点一次「重新生成叙述」就 +1，出现在下面 effect 的依赖数组里，用来在不改变
  // profile/fs/locale 的情况下强制重新跑一次那段 fetch 逻辑，避免另写一份重复的
  // fetch/then/catch。缓存分支本身是安全的重放入口：failed/degraded 态下
  // readFengshuiCache 在上一次同一个 effect 里已经确认过是 cache miss
  // （命中的话根本不会走到 fetch、也就不会进入 failed/degraded），所以重跑时
  // 该分支自然还是 miss，会照常发起新请求，不需要额外清缓存。
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!ENABLED) return;
    (hasTgSession() ? tgGetProfile() : getActiveProfile())
      .then((p: Profile | null) => setProfile(p))
      .catch(() => setProfile(null));
  }, []);

  // 确定性派生：与 LLM 无关，永远可得
  const fs: FengshuiChart | null = useMemo(
    () => (profile ? computeFengshui({ birth: profile.birthInput, chart: profile.chart }) : null),
    [profile],
  );

  useEffect(() => {
    if (!profile || !fs) return;
    // 竞态保护：locale 切换 / 点击重试都会让本 effect 重新跑一遍，可能与上一次
    // 尚未落定的 fetch 同时在途。用 `cancelled` 标志确保只有「最新一次」的
    // then/catch 真正写状态，旧的一律作废——否则旧响应可能在新响应之后才落定，
    // 反而把新结果覆盖回旧内容。
    let cancelled = false;
    // 状态重置：修复「命中缓存分支直接 return、.catch 也不清 degraded/failed」的
    // 陈旧状态残留 bug——上一次（比如切 locale 前）若以 degraded/failed 收尾，
    // 这次 effect 重跑必须先清掉，否则新的可信内容会被上一次遗留的提示挡住。
    setFailed(false);
    setDegraded(false);
    setSections(null);

    const key = fengshuiCacheKey(profile.id, FENGSHUI_ENGINE_VERSION, locale);
    const cached = readFengshuiCache(key);
    if (cached) { setSections(cached); return; }
    fetch("/api/fengshui/reading", {
      method: "POST",
      headers: { "content-type": "application/json", "x-zj-locale": locale },
      body: JSON.stringify(profile.birthInput),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        const data = (await r.json()) as { sections: FengshuiSections; degraded: boolean };
        if (cancelled) return;
        setSections(data.sections);
        setDegraded(data.degraded);
        if (!data.degraded) writeFengshuiCache(key, data.sections);
      })
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => { cancelled = true; };
  }, [profile, fs, locale, retryNonce]);

  function regenerate() {
    setRetryNonce((n) => n + 1);
  }

  if (!ENABLED) return <Centered>{t("fengshui.notEnabled")}</Centered>;
  if (profile === undefined) return <Centered>{t("fengshui.loadingProfile")}</Centered>;
  if (profile === null) {
    return (
      <Centered>
        <p className="text-ink-2">{t("fengshui.noProfile")}</p>
        <Link href="/reading" className="mt-4 inline-block px-6 py-3 text-on-ink"
          style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}>
          {t("fengshui.goCast")}
        </Link>
      </Centered>
    );
  }

  const g = fs!.mingGua;
  return (
    <main className="mx-auto max-w-[720px] px-4 pb-8 pt-6">
      <h1 className="text-[24px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.title")}</h1>
      <p className="mt-1 text-[13px] text-muted">{t("fengshui.subtitle")}</p>

      <section className="mt-6 flex flex-col items-center">
        <BaguaWheel verdicts={fs!.personalDirections} centerLabel={`${g.guaName}${g.gua}`} />
        <p className="mt-2 text-[13px] text-ink-2">
          {t("fengshui.mingGua")}：{g.guaName}{g.gua}（{g.group}）
        </p>
      </section>

      {sections && !degraded && (
        <section className="mt-6 flex flex-col gap-6">
          <div>
            <h2 className="text-[18px]" style={{ fontFamily: "var(--font-serif)" }}>
              {t(SECTION_HEADING_KEY.situation)}
            </h2>
            <div className="reading-prose mt-2"><Markdown text={sections.situation} /></div>
          </div>
          <div>
            <h2 className="text-[18px]" style={{ fontFamily: "var(--font-serif)" }}>
              {t(SECTION_HEADING_KEY.youAndSpace)}
            </h2>
            <div className="reading-prose mt-2"><Markdown text={sections.youAndSpace} /></div>
          </div>
        </section>
      )}
      {degraded && (
        <div className="mt-6">
          <p className="text-[13px] text-muted">{t("fengshui.narrativeDegraded")}</p>
          <button type="button" onClick={regenerate} className="mt-2 text-[13px]" style={{ color: "var(--color-cinnabar)" }}>
            {t("fengshui.regenerate")}
          </button>
        </div>
      )}
      {failed && !sections && (
        <div className="mt-6">
          <p className="text-[13px] text-muted">{t("fengshui.narrativeFailed")}</p>
          <button type="button" onClick={regenerate} className="mt-2 text-[13px]" style={{ color: "var(--color-cinnabar)" }}>
            {t("fengshui.regenerate")}
          </button>
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-[18px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.remedyTitle")}</h2>
        {sections && !degraded && (
          <div className="reading-prose mt-2"><Markdown text={sections.actions} /></div>
        )}
        <ul className="mt-3 flex flex-col gap-3">
          {fs!.remedies.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-center gap-2 text-[12px] text-muted">
                <span>{t(`fengshui.effortLabel.${r.effort}`)}</span>
                <span>·</span>
                <span>{r.evidence === "传统象征" ? t("fengshui.evidenceSymbolic") : t("fengshui.evidenceBoth")}</span>
              </div>
              <p className="mt-1.5 text-[15px] text-ink">{r.action}</p>
              <p className="mt-2 text-[13px] text-ink-2">{t("fengshui.traditionalLabel")}：{r.traditional}</p>
              {r.modern && (
                <p className="mt-1 text-[13px] text-ink-2">{t("fengshui.modernLabel")}：{r.modern}</p>
              )}
              <Link
                href={`/spirit?topic=fengshui:${encodeURIComponent(r.id)}`}
                className="mt-3 inline-block text-[13px]"
                style={{ color: "var(--color-cinnabar)" }}
              >
                {t("fengshui.askMira")}
              </Link>
            </Card>
          ))}
        </ul>
      </section>

      <p className="mt-8 text-[12px] text-muted">{t("fengshui.disclaimer")}</p>

      <Link href="/fengshui/object" className="mt-6 inline-block text-[14px]" style={{ color: "var(--color-cinnabar)" }}>
        {t("fengshui.object.title")}
      </Link>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
