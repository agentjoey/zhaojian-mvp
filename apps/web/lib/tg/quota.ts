import { supabaseAdmin } from "./admin";

export async function consumeQuota(tgUserId: number): Promise<boolean> {
  // 全局关闭免费额度限制（env 开关，可逆）：TG_QUOTA_DISABLED=1 时所有 LLM 动作放行。
  if (process.env.TG_QUOTA_DISABLED === "1") return true;
  const { data, error } = await supabaseAdmin().rpc("consume_llm_credit", {
    p_tg_user_id: tgUserId,
  });
  if (error) {
    console.error("consume_llm_credit error:", error);
    return false;
  }
  return data === true;
}

export async function quotaStatus(
  tgUserId: number,
): Promise<{ used: number; limit: number }> {
  const { data, error } = await supabaseAdmin()
    .from("tg_users")
    .select("llm_uses, free_llm_quota")
    .eq("tg_user_id", tgUserId)
    .maybeSingle();
  if (error) {
    console.error("quotaStatus error:", error);
    return { used: 0, limit: 0 };
  }
  return {
    used: (data?.llm_uses as number | null) ?? 0,
    limit: (data?.free_llm_quota as number | null) ?? 0,
  };
}
