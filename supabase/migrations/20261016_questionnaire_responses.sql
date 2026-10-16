-- Applied to Supabase project "rescue-site" (yysfgsdwlddeilktumza).
-- The public page can only call save_questionnaire; it cannot read or list rows.
create table public.questionnaire_responses (
  device_id   uuid primary key,
  answers     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  save_count  integer not null default 1
);
alter table public.questionnaire_responses enable row level security;
revoke all on public.questionnaire_responses from anon, authenticated;

create function public.save_questionnaire(p_device uuid, p_answers jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare ts timestamptz := now();
begin
  if p_device is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'bad payload';
  end if;
  if pg_column_size(p_answers) > 262144 then
    raise exception 'payload too large';
  end if;
  if not exists (select 1 from public.questionnaire_responses where device_id = p_device)
     and (select count(*) from public.questionnaire_responses) >= 25 then
    raise exception 'too many devices';
  end if;
  insert into public.questionnaire_responses as r (device_id, answers)
  values (p_device, p_answers)
  on conflict (device_id) do update
    set answers = excluded.answers, updated_at = ts, save_count = r.save_count + 1;
  return ts;
end $$;

revoke all on function public.save_questionnaire(uuid, jsonb) from public;
revoke execute on function public.save_questionnaire(uuid, jsonb) from authenticated;
grant execute on function public.save_questionnaire(uuid, jsonb) to anon;
