-- EP-tg · Telegram 身份映射 + 偏好 + 免费额度
create table if not exists public.tg_users (
  tg_user_id        bigint primary key,
  supabase_user_id  uuid not null references auth.users(id) on delete cascade,
  tg_chat_id        bigint,
  username          text,
  lang              text default 'zh',
  tz                text default 'Asia/Shanghai',
  daily_push        boolean default false,
  push_hour         int default 8,
  llm_uses          int default 0,
  free_llm_quota    int default 30,
  quota_period      text default 'lifetime',
  created_at        timestamptz default now()
);
create unique index if not exists tg_users_supabase_user_idx on public.tg_users (supabase_user_id);
alter table public.tg_users enable row level security;
-- 仅本人可读自己的映射行（按签发会话的 uuid）；写入仅 service_role（默认无 policy = 拒绝，service_role 绕过）
create policy own_select on public.tg_users for select using (auth.uid() = supabase_user_id);
