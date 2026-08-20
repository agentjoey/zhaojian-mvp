import { supabaseAdmin } from "@/lib/tg/admin";

/** 条款版本——改版时改这个常量即可，不用动表结构（spec §6②，v1 最小面）。 */
export const TERMS_VERSION = "2026-08-20";

/**
 * 记录一次条款接受（EP-account2-07）。幂等——`user_consents` 表在
 * (user_id, document, version) 上有唯一约束，重复调用只会撞唯一键冲突，
 * 不会插出第二条。best-effort：任何失败都吞掉，不抛错——记录条款接受
 * 不该阻断调用方（TG 建号 / 查看已绑定身份）的主流程。
 */
export async function recordConsentOnce(uid: string, document: string, version: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin()
      .from("user_consents")
      .insert({ user_id: uid, document, version }, { count: undefined });
    if (error && error.code !== "23505") {
      console.error("recordConsentOnce error", error);
    }
  } catch (e) {
    console.error("recordConsentOnce threw", e);
  }
}
