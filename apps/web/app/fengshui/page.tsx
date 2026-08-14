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
import { fengshuiCacheKey, readFengshuiCache, writeFengshuiCache } from "@/lib/fengshui-cache";

const ENABLED = process.env.NEXT_PUBLIC_FENGSHUI_ENABLED === "1";

/**
 * 「境」页（EP-fs-07）。骨架——命卦、八方盘、化解清单——全部确定性计算，
 * 与 LLM 无关、永远可得；叙述层由 LLM 生成，是唯一会失败/降级的部分。
 * 两档降级路径都不留白页，只在骨架旁边加一行可见提示：
 *   1. failed  —— 请求本身失败（网络/超时/非 2xx）：没有叙述可显示。
 *   2. degraded —— 请求成功，但 generateFengshuiReading 判定模型说错过
 *      确定性事实（方位↔星名对不上），已被机械纠正。纠正只救得回星名，
 *      救不回建立在错方位上的整段叙述，所以不能把它当正常结果直接渲染
 *      （见 @eamvp/llm 的 FengshuiReading.degraded 文档）；也不写入缓存，
 *      避免一份带瑕疵的报告被永久复用。
 */
export default function FengshuiPage() {
  const t = useT();
  const { locale } = useLocale();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [degraded, setDegraded] = useState(false);

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
    const key = fengshuiCacheKey(profile.id, FENGSHUI_ENGINE_VERSION, locale);
    const cached = readFengshuiCache(key);
    if (cached) { setNarrative(cached); return; }
    fetch("/api/fengshui/reading", {
      method: "POST",
      headers: { "content-type": "application/json", "x-zj-locale": locale },
      body: JSON.stringify(profile.birthInput),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        const isDegraded = r.headers.get("X-Fengshui-Degraded") === "1";
        const md = await r.text();
        setNarrative(md);
        setDegraded(isDegraded);
        if (!isDegraded) writeFengshuiCache(key, md);
      })
      .catch(() => setFailed(true));
  }, [profile, fs, locale]);

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

      {narrative && !degraded && (
        <section className="mt-6">
          <Markdown text={narrative} />
        </section>
      )}
      {degraded && (
        <p className="mt-6 text-[13px] text-muted">{t("fengshui.narrativeDegraded")}</p>
      )}
      {failed && !narrative && (
        <p className="mt-6 text-[13px] text-muted">{t("fengshui.narrativeFailed")}</p>
      )}

      <section className="mt-8">
        <h2 className="text-[18px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.remedyTitle")}</h2>
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
