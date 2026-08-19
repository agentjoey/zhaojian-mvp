import { readSession, sessionNeedsRefresh, TG_COOKIE } from "@/lib/tg/session";
import { supabaseAdmin } from "@/lib/tg/admin";

/**
 * 全站唯一 uid 解析入口（EP-account2-02）。
 *
 * ⚠️ 故意只读 `req.headers`，不用 `next/headers` 的 `cookies()`：那个 API 依赖
 * Next 请求处理内部的 AsyncLocalStorage 上下文，只有真正经过 Next 路由分发时才会
 * 被填充。这个仓库的 route 测试统一是「直接 import handler、拿手搓 Request 调用」
 * （不经过 Next 开发/构建服务器），cookies() 在这种调用方式下不可靠——
 * api/fengshui/reading/route.ts 和 api/billing/status/route.ts 早先各自独立踩过
 * 这个坑、各写了一份手动解析 cookie 的重复代码。本函数改造后可以被这两处直接复用
 * （见本任务 Step 10/11），从「3 份重复实现」收敛到 1 份。
 */
export async function resolveUid(
  req: Request,
): Promise<{ uid: string; via: "tg" | "web"; needsRefresh: boolean } | null> {
  // 1) Telegram session cookie (zj_tg)
  const cookieHeader = req.headers.get("cookie") ?? "";
  const tgToken = cookieHeader
    .split("; ")
    .find((c) => c.startsWith(`${TG_COOKIE}=`))
    ?.slice(TG_COOKIE.length + 1);
  const s = readSession(tgToken);
  if (s) return { uid: s.uid, via: "tg", needsRefresh: sessionNeedsRefresh(s.exp) };

  // 2) Web session via Authorization Bearer token
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const { data } = await supabaseAdmin().auth.getUser(token);
    if (data.user) return { uid: data.user.id, via: "web", needsRefresh: false };
  }

  return null;
}
