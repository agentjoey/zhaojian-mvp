-- EP-dream-history · 解梦历史（最近 10 条，摘要）
-- 与 spirit_messages 同一 RLS 形状（own_*，auth.uid() = user_id 隔离，消息不可变）。
--
-- 只存 summary（LLM 生成的第三人称主题摘要），不存梦原文——spec §5.1「梦原文不落库、
-- 不进日志」这条红线对新表同样适用；summary 由 summarizeDreamEntry() 在应用层生成后
-- 才写入，本表本身不知道、也不应该知道梦的逐字原文。
--
-- 「最近 10 条」的裁剪在应用层做（写入后删掉超出 10 条的旧行），不做成 DB 触发器/RPC——
-- 本仓库已经因为 security definer RPC 忘记收权限出过两次生产漏洞（0012/0015），裁剪这种
-- 非特权操作没必要再开一个新的 RPC 面。

create table if not exists public.dream_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  summary     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists dream_history_profile_created_idx
  on public.dream_history (profile_id, created_at);

alter table public.dream_history enable row level security;

create policy own_select on public.dream_history for select using (auth.uid() = user_id);
create policy own_insert on public.dream_history for insert with check (auth.uid() = user_id);
create policy own_delete on public.dream_history for delete using (auth.uid() = user_id);
