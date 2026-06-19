import Link from "next/link";
import { SealIcon } from "@/components/ui";
import { ReadingForm } from "./ReadingForm";

export default function ReadingPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-8 px-6 py-12">
      <div className="space-y-3">
        <Link href="/" className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-cinnabar">
          <SealIcon char="照" size={22} /> 照见
        </Link>
        <h1 className="text-[28px] font-semibold leading-tight">告诉我，你何时来到这世间。</h1>
        <p className="text-[14px] leading-[1.85] text-ink-2">
          我们即时推算你的八字、紫微斗数与西方本命盘。
          出生地用于校正真太阳时；若缺出生时辰，将略去心理（西方）层，仅呈现命理。
        </p>
      </div>

      <ReadingForm />

      <p className="text-[12px] leading-relaxed text-muted">
        出生信息属敏感个人信息。本产品<strong className="text-ink-2">不存储</strong>——命盘即时计算。仅供自我观照。
      </p>
    </main>
  );
}
