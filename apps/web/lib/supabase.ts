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
  return { id: data.user.id, email: data.user.email ?? null, isAnonymous: !!(data.user as any).is_anonymous };
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
  } catch (e: any) {
    return { ok: false, error: e?.message || "升级失败" };
  }
}

export async function signInWithEmail(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await supabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof location !== "undefined" ? location.origin + "/auth/callback" : undefined },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "发送失败" };
  }
}

export async function signOutWeb(): Promise<void> {
  await supabase().auth.signOut();
}
