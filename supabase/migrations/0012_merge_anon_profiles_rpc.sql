-- EP-account2-06 · 匿名档案归属迁移改事务化
-- 此前 mergeAnonProfiles() 是两次独立 update（profiles 一次、spirit_messages
-- 一次），非事务——如果第一次成功、第二次失败（网络抖动/RLS/约束冲突），
-- 用户会永久卡在「档案已经转移但对话记录没转移」的半迁移状态,且没有重试
-- 机制能安全地重新跑一遍（重跑会把已经迁移过的行再跑一次 update，语义上
-- 是幂等的，但两张表分开跑仍然存在「跑了一半进程被杀」的窗口）。
--
-- 改成 security definer 的单事务 RPC：两张表的 update 在同一个事务里，
-- 要么都成功要么都不生效；调用方即使重复调用同一对 (anon_id, target_id)
-- 也是安全的（第二次调用时两张表都已经没有 user_id = anon_id 的行了，
-- update 影响 0 行，返回 0，不是错误）。

create or replace function public.merge_anon_profiles(p_anon_id uuid, p_target_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merged int;
begin
  if p_anon_id = p_target_id then
    return 0;
  end if;

  update public.profiles
    set user_id = p_target_id
    where user_id = p_anon_id;
  get diagnostics v_merged = row_count;

  update public.spirit_messages
    set user_id = p_target_id
    where user_id = p_anon_id;

  return v_merged;
end;
$$;

-- security definer 函数必须回收公开 EXECUTE：否则持公开 anon key 的任何人
-- 可经 PostgREST 用任意 (anon_id, target_id) 直接调 RPC，把别人的档案和
-- 对话记录转到自己名下。service_role 的授权独立于 public/anon/authenticated，
-- 服务端 supabaseAdmin 调用不受影响——语义上本函数只允许服务端调用。
revoke execute on function public.merge_anon_profiles(uuid, uuid) from public, anon, authenticated;
