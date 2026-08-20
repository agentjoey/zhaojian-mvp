import { supabaseAdmin } from "@/lib/tg/admin";
import { mergeAnonProfiles } from "@/lib/tg/merge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/merge-anon —— EP-account-login。
 *
 * 换设备用已注册邮箱登录时，account 页的 `upgradeAnonymousToEmail` 会失败（邮箱
 * 已属于别的账号），退回真正的 `signInWithEmail` 登录后，这台设备之前的匿名会话
 * 数据（档案/灵记忆等）需要合并进刚登录的真实账号——否则这台设备上排过的盘就
 * 孤儿化了。语义与 `api/auth/telegram/route.ts` 的 TG 登录合并完全一致，复用同一
 * 个 `mergeAnonProfiles`；目标账号从 Authorization Bearer（刚登录成功的真实会话）
 * 解析，不信任客户端传来的 uid——同一条安全约定贯穿本仓库所有身份相关端点。
 */
export async function POST(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return new Response("未登录", { status: 401 });
  const { data } = await supabaseAdmin().auth.getUser(authHeader.slice(7));
  const targetUserId = data.user?.id;
  if (!targetUserId) return new Response("未登录", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const anonAccessToken = typeof body?.anonAccessToken === "string" ? body.anonAccessToken : "";
  if (!anonAccessToken) return Response.json({ merged: 0 });

  const result = await mergeAnonProfiles(anonAccessToken, targetUserId);
  return Response.json(result);
}
