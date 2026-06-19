import Link from "next/link";
import { BellLogo } from "@/components/ui";
import { ReadingForm } from "./ReadingForm";

export default function ReadingPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-8 px-6 py-12">
      <div className="space-y-3">
        <Link href="/" className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-cinnabar">
          <BellLogo size={22} /> 照见
        </Link>
        <div className="latin-label text-[11px] text-cinnabar">Cast your chart</div>
        <h1 className="font-serif text-[30px] font-black leading-tight">告诉我，<br />你何时来到这世间。</h1>
        <p className="text-[14px] leading-[1.85] text-ink-2">
          我们即时推算你的八字、紫微斗数与西方本命盘。
          出生地用于校正真太阳时；若缺出生时辰，将略去心理（西方）层，仅呈现命理。
        </p>
      </div>

      <ReadingForm />

      <p className="text-[12px] leading-relaxed text-muted">
        出生信息属敏感个人信息。命盘<strong className="text-ink-2">存于你的私人档案</strong>（匿名、按设备隔离，仅你可见），可随时在「档案」中删除。仅供自我观照。
      </p>
    </main>
  );
}
