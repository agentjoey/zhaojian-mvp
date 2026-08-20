-- EP-account2-bind · 邮箱绑定意向的服务端存储（重设计，取代 user_metadata 方案）
--
-- 为什么不能继续放 user_metadata（评审 NEW-1/NEW-5）：
--   1. user_metadata 是账号持有者可直接写的（supabase.auth.updateUser({data})），
--      把一条安全攸关的记录放在被鉴权方可控的存储里，等于校验形同虚设；
--   2. 靠「省略 key」清除依赖 GoTrue 的合并语义，实测不可靠——清不掉就意味着
--      同一条意向可被无限重放；
--   3. 没有过期概念，一条意向可以躺到任意远的将来才被触发。
--
-- 本表把这三点变成 schema 层的事实：仅 service_role 可读写（不建任何 RLS 策略
-- = 除 service_role 外全部拒绝）、nonce 唯一、consumed_at 实现单次消费、
-- created_at 实现过期。
--
-- ⚠️ nonce 是绑定流程的唯一账号选择依据：它随 emailRedirectTo 走 URL 进入用户
-- 邮箱，跨浏览器有效。旧设计按「邮箱字符串」在全库反查目标账号，导致任何人都能
-- 为一个尚未注册的邮箱预埋意向，等真正的所有者首次注册时把对方账号吞掉。

create table if not exists public.email_bind_pending (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text not null,
  nonce       text not null unique,
  created_at  timestamptz not null default now(),
  consumed_at timestamptz
);

-- 仅按 nonce 查（complete 阶段）与按 user_id 清理（prepare 阶段作废旧意向）。
create index if not exists email_bind_pending_user_idx on public.email_bind_pending(user_id);

-- RLS 开启但**不建任何策略**：anon/authenticated 一律拒绝，只有 service_role
-- （绕过 RLS）能读写。绑定意向不该被任何客户端直接触碰。
alter table public.email_bind_pending enable row level security;
