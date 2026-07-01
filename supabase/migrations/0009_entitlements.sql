create table if not exists public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free',           -- 'free' | 'member'
  member_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.entitlements enable row level security;
create policy own_select on public.entitlements for select using (auth.uid() = user_id);
-- 写入仅 service_role（支付回调/管理），无 insert/update policy → 匿名/普通用户不可改
