"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 未配置：缺 NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY");
  _client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return _client;
}

/** 确保有会话：无则匿名登录（MVP；后续可升级邮箱）。返回 user_id。 */
export async function ensureSession(): Promise<string> {
  const sb = supabase();
  const { data } = await sb.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const { data: anon, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  return anon.user!.id;
}

export async function getWebUser(): Promise<{ id: string; email: string | null; isAnonymous: boolean } | null> {
  const { data } = await supabase().auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null, isAnonymous: !!data.user.is_anonymous };
}

export async function upgradeAnonymousToEmail(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await supabase().auth.updateUser(
      { email },
      { emailRedirectTo: typeof location !== "undefined" ? location.origin + "/auth/callback" : undefined },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "升级失败" };
  }
}

/**
 * @param bindNonce 绑定邮箱流程的一次性 nonce（来自 /api/account/attach 阶段 1）。
 *   它随 emailRedirectTo 进入邮件 URL，是 complete 阶段**唯一**的账号选择依据——
 *   跨浏览器有效（TG Mini App 里发的信通常在系统浏览器打开，那里没有 zj_tg cookie）。
 *   普通登录不传，链接里就没有 nonce，因此走不进绑定流程。
 */
export async function signInWithEmail(
  email: string,
  bindNonce?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const redirect =
      typeof location !== "undefined"
        ? location.origin + "/auth/callback" + (bindNonce ? `?bind=${encodeURIComponent(bindNonce)}` : "")
        : undefined;
    const { error } = await supabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirect },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "发送失败" };
  }
}

export async function signOutWeb(): Promise<void> {
  await supabase().auth.signOut();
}
