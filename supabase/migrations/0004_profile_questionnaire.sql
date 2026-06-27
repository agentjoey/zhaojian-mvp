-- EP-profile-q · 心理自陈问卷
-- 用户主观自陈（命盘客观 + 自我认知主观）。可空、默认 null；不动 profiles 现有 RLS。

alter table public.profiles add column if not exists questionnaire jsonb;
