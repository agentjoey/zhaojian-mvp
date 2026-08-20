-- EP-account2-07 · 条款接受记录（合规最小面，spec §6②）
-- 记录点在身份建立那一刻（TG 首次创建 / 首次识别为非匿名），不在匿名浏览
-- 时——匿名浏览只是在看，还没有「关系」可言。带 version 列但不建版本管理
-- 机制（v1 最小面）：条款改版时插新行即可，不用改表结构。
-- 消息不可变——同 spirit_messages 的既有惯例，只给 select/insert 开策略。

create table if not exists public.user_consents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  document     text not null,
  version      text not null,
  accepted_at  timestamptz not null default now(),
  unique (user_id, document, version)
);

alter table public.user_consents enable row level security;
create policy own_select on public.user_consents for select using (auth.uid() = user_id);
create policy own_insert on public.user_consents for insert with check (auth.uid() = user_id);

create index if not exists user_consents_user_idx on public.user_consents(user_id, document);
