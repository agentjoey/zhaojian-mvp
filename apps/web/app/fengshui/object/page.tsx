"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { computeFengshui, type FengshuiChart } from "@eamvp/core";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { useT } from "@/lib/i18n/I18nProvider";
import { ObjectAdvisorForm } from "../ObjectAdvisorForm";

const ENABLED = process.env.NEXT_PUBLIC_FENGSHUI_ENABLED === "1";

/**
 * 物件顾问页（EP-fs-08）。与「境」主页面（../page.tsx）同一套骨架约定：flag 门控、
 * 档案读取（Telegram 会话优先，否则匿名档案）、加载/无档案态处理。落位建议本身
 * （推荐方位/不宜方位/品类规则/与命主关系）由 ObjectAdvisorForm 内部调用 core 的
 * `adviseObject` 纯函数确定性算出，本页只负责派生 FengshuiChart 并把它交下去。
 */
export default function FengshuiObjectPage() {
  const t = useT();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    if (!ENABLED) return;
    (hasTgSession() ? tgGetProfile() : getActiveProfile())
      .then((p: Profile | null) => setProfile(p))
      .catch(() => setProfile(null));
  }, []);

  const fs: FengshuiChart | null = useMemo(
    () => (profile ? computeFengshui({ birth: profile.birthInput, chart: profile.chart }) : null),
    [profile],
  );

  if (!ENABLED) return <Centered>{t("fengshui.notEnabled")}</Centered>;
  if (profile === undefined) return <Centered>{t("fengshui.loadingProfile")}</Centered>;
  if (profile === null) {
    return (
      <Centered>
        <p className="text-ink-2">{t("fengshui.noProfile")}</p>
        <Link href="/reading" className="mt-4 text-[14px]" style={{ color: "var(--color-cinnabar)" }}>
          {t("fengshui.goCast")}
        </Link>
      </Centered>
    );
  }

  return (
    <main className="mx-auto max-w-[720px] px-4 pb-8 pt-6">
      <Link href="/fengshui" className="text-[13px] text-ink-2">← {t("fengshui.title")}</Link>
      <h1 className="mt-3 text-[22px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.object.title")}</h1>
      <p className="mt-1 text-[13px] text-muted">{t("fengshui.object.subtitle")}</p>
      <div className="mt-6"><ObjectAdvisorForm fs={fs!} /></div>
      <p className="mt-8 text-[12px] text-muted">{t("fengshui.disclaimer")}</p>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
