-- EP-spirit-05 · 关系记忆
-- 灵跨会话记住的关切（滚动摘要，无 PII）。可空、默认 null；不动 profiles 现有 RLS。

alter table public.profiles add column if not exists spirit_memory jsonb;
