import { cookies } from "next/headers";
import { readSession, TG_COOKIE } from "@/lib/tg/session";
import { supabaseAdmin } from "@/lib/tg/admin";

export async function resolveUid(
  req: Request,
): Promise<{ uid: string; via: "tg" | "web" } | null> {
  // 1) Telegram session cookie (zj_tg)
  const c = (await cookies()).get(TG_COOKIE)?.value;
  const s = readSession(c);
  if (s) return { uid: s.uid, via: "tg" };

  // 2) Web session via Authorization Bearer token
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const { data } = await supabaseAdmin().auth.getUser(token);
    if (data.user) return { uid: data.user.id, via: "web" };
  }

  return null;
}
