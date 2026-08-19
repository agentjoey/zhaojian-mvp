import { supabaseAdmin } from "./admin";

/**
 * 匿名用户排的盘迁到已识别账号名下（EP-account2-06）。改为单事务 RPC
 * （见 supabase/migrations/0012_merge_anon_profiles_rpc.sql）——此前是两次
 * 独立 update，半迁移会让用户永久丢一半数据。RPC 天然幂等：重复调用同一对
 * (anon_id, target_id) 不会出错，只是第二次影响 0 行。
 */
export async function mergeAnonProfiles(
  anonAccessToken: string,
  targetUserId: string,
): Promise<{ merged: number }> {
  const admin = supabaseAdmin();
  const { data: u } = await admin.auth.getUser(anonAccessToken);
  const anon = u?.user;
  if (!anon || anon.id === targetUserId || !anon.is_anonymous) {
    return { merged: 0 };
  }

  const { data, error } = await admin.rpc("merge_anon_profiles", {
    p_anon_id: anon.id,
    p_target_id: targetUserId,
  });
  if (error) {
    console.error("merge_anon_profiles rpc error", error);
    return { merged: 0 };
  }
  return { merged: (data as number | null) ?? 0 };
}
