"use client";

import Link from "next/link";
import { BellLogo } from "@/components/ui";
import { useT } from "@/lib/i18n/I18nProvider";
import { ReadingForm } from "./ReadingForm";

export default function ReadingPage() {
  const t = useT();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-8 px-6 py-12">
      <div className="space-y-3">
        <Link href="/" className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-cinnabar">
          <BellLogo size={22} /> {t("common.brand")}
        </Link>
        <div className="latin-label text-[11px] text-cinnabar">Cast your chart</div>
        <h1 className="font-serif text-[30px] font-black leading-tight">
          {t("reading.heroTitle1")}<br />{t("reading.heroTitle2")}
        </h1>
        <p className="text-[14px] leading-[1.85] text-ink-2">
          {t("reading.intro")}
        </p>
      </div>

      <ReadingForm />

      <p className="text-[12px] leading-relaxed text-muted">
        {t("reading.disclaimerStart")}
        <strong className="text-ink-2">{t("reading.disclaimerHighlight")}</strong>
        {t("reading.disclaimerEnd")}
      </p>
    </main>
  );
}
