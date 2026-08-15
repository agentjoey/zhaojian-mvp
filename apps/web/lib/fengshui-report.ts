import { supabase, ensureSession } from "@/lib/supabase";

export type FengshuiSections = { situation: string; youAndSpace: string; actions: string };

export type FingerprintInput = {
  profileId: string;
  locale: string;
  engineVersion: string;
  /** null = Layer 0 */
  dwelling: { id: string; facing: string; tenancy: "rent" | "own"; kind: "home" | "office" } | null;
  memberProfileIds: string[];
};

/**
 * 报告指纹（EP-fs-16）。与三段式解读不同：命盘冻结所以解读永久有效，
 * 而居所可变 —— 改朝向、增减同住人、切语言、升引擎版本都必须让旧报告失效。
 * 波1 用的 (档案,版本,locale) localStorage 键装不下居所与成员集合，故换成指纹。
 * 同住人按集合语义（排序后入参），避免顺序变动触发无谓重生成。
 */
export function fengshuiFingerprint(i: FingerprintInput): string {
  const canonical = JSON.stringify({
    p: i.profileId,
    l: i.locale,
    v: i.engineVersion,
    d: i.dwelling ? [i.dwelling.id, i.dwelling.facing, i.dwelling.tenancy, i.dwelling.kind] : null,
    m: [...i.memberProfileIds].sort(),
  });
  // djb2：确定性、无依赖、够用（这不是安全哈希，只用来做缓存键）
  let h = 5381;
  for (let k = 0; k < canonical.length; k++) h = ((h << 5) + h + canonical.charCodeAt(k)) | 0;
  return `fs${(h >>> 0).toString(36)}`;
}

export async function readFengshuiReport(fingerprint: string): Promise<FengshuiSections | null> {
  await ensureSession();
  const { data, error } = await supabase()
    .from("fengshui_reports").select("sections")
    .eq("input_fingerprint", fingerprint).maybeSingle();
  if (error) throw error;
  return (data?.sections as FengshuiSections) ?? null;
}

export async function saveFengshuiReport(args: {
  fingerprint: string; profileId: string; dwellingId: string | null;
  layer: 0 | 1; locale: string; sections: FengshuiSections;
}): Promise<void> {
  const uid = await ensureSession();
  const { error } = await supabase().from("fengshui_reports").upsert({
    uid, input_fingerprint: args.fingerprint, profile_id: args.profileId,
    dwelling_id: args.dwellingId, layer: args.layer, locale: args.locale, sections: args.sections,
  }, { onConflict: "uid,input_fingerprint" });
  if (error) throw error;
}
