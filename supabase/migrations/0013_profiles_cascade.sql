-- EP-account2-07 · profiles.user_id → auth.users(id) 级联删除显式化（幂等）
-- profiles 建表迁移不在仓库内（迁移编号从 0002 起跳，早于迁移被跟踪），
-- 当前是否已有 cascade 约束无法从源码核实——注销账号时最核心的这张表的
-- 级联行为必须能从仓库里读出来，收钱产品上这点模糊不可接受。
--
-- 覆盖三种可能的现状：
--   1) 已存在 on delete cascade 约束 → 跳过，不重复添加
--   2) 存在但不是 cascade（比如默认的 no action）→ 先删旧约束，再建 cascade 版本
--   3) 完全没有 FK 约束 → 直接建 cascade 版本

do $$
declare
  r record;
  has_cascade boolean := false;
begin
  for r in
    select con.conname, con.confdeltype
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'profiles'
      and con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
      and con.conkey = (
        select array_agg(attnum order by attnum)
        from pg_attribute
        where attrelid = rel.oid and attname = 'user_id'
      )
  loop
    if r.confdeltype = 'c' then
      has_cascade := true;
    else
      execute format('alter table public.profiles drop constraint %I', r.conname);
    end if;
  end loop;

  if not has_cascade then
    alter table public.profiles
      add constraint profiles_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;
