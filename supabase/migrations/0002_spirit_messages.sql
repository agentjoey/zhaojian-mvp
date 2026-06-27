-- EP-spirit-04 · 本命之灵对话存储
-- 匿名 + RLS（镜像 profiles 的 own_* 策略，auth.uid() = user_id 隔离）。
-- 消息不可变（无 update 策略）；profile 删除级联清理。

create table if not exists public.spirit_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('user','spirit')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists spirit_messages_profile_created_idx
  on public.spirit_messages (profile_id, created_at);

alter table public.spirit_messages enable row level security;

create policy own_select on public.spirit_messages for select using (auth.uid() = user_id);
create policy own_insert on public.spirit_messages for insert with check (auth.uid() = user_id);
create policy own_delete on public.spirit_messages for delete using (auth.uid() = user_id);
