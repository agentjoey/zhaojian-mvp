-- EP-account2-fix · 回收两个 LLM 额度 RPC 的公开 EXECUTE
--
-- consume_llm_credit（0006 建，TG 侧按 tg_user_id 计）与
-- consume_llm_credit_account（0010 建，web 账号侧按 user_id 计）都是
-- security definer，且建函数时未回收默认 ACL——Postgres 对新函数的默认
-- 授权是 PUBLIC EXECUTE，即 anon / authenticated 角色都能经 PostgREST
-- 直接调用。anon key 就打包在浏览器 bundle 里，意味着任何拿到别人
-- tg_user_id / user uuid 的人都可以循环调 RPC 烧干其月度免费额度
-- （与 T6 在 0012 修掉的 merge_anon_profiles 是同一类洞）。
--
-- service_role 的授权独立于 public/anon/authenticated，服务端
-- supabaseAdmin 调用不受影响——语义上这两个函数只允许服务端调用。
revoke execute on function public.consume_llm_credit(bigint) from public, anon, authenticated;
revoke execute on function public.consume_llm_credit_account(uuid, int) from public, anon, authenticated;
