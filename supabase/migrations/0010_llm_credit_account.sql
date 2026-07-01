create table if not exists public.llm_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  period  text not null,               -- 'YYYY-MM'
  uses    int not null default 0,
  primary key (user_id, period)
);
alter table public.llm_usage enable row level security;   -- 仅 service_role 访问
create or replace function public.consume_llm_credit_account(p_user_id uuid, p_free int default 30)
returns boolean language plpgsql security definer as $$
declare v_period text := to_char(now(),'YYYY-MM'); v_uses int;
begin
  insert into public.llm_usage(user_id, period, uses) values (p_user_id, v_period, 0)
    on conflict (user_id, period) do nothing;
  select uses into v_uses from public.llm_usage where user_id=p_user_id and period=v_period for update;
  if v_uses >= p_free then return false; end if;
  update public.llm_usage set uses = uses + 1 where user_id=p_user_id and period=v_period;
  return true;
end $$;
