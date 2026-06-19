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
