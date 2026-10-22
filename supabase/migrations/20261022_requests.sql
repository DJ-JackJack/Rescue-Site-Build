-- From Taea's list of 2026-10-22: a "request" message topic, for asking Taea to cover a topic, react to or respond to a
-- video, or answer a question, by reply or in a video. Same checks and limits as every other message.
alter table public.messages drop constraint if exists messages_topic_check;
alter table public.messages add constraint messages_topic_check check (topic in ('partner','help','dog','sniffari','request','other'));

create or replace function public.submit_message(p_topic text, p_email text, p_name text default null, p_body text default null,
                                                 p_details jsonb default '{}'::jsonb, p_page text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_topic not in ('partner','help','dog','sniffari','request','other') then raise exception 'bad topic'; end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then raise exception 'bad email'; end if;
  if length(coalesce(p_name,'')) > 200 or length(coalesce(p_body,'')) > 5000 or length(coalesce(p_page,'')) > 200
     or pg_column_size(coalesce(p_details,'{}'::jsonb)) > 8192 or jsonb_typeof(coalesce(p_details,'{}'::jsonb)) <> 'object' then
    raise exception 'too long';
  end if;
  if (select count(*) from public.messages where lower(email) = lower(p_email) and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.messages where created_at > now() - interval '1 hour') >= 40 then
    raise exception 'slow down';
  end if;
  insert into public.messages(topic, email, name, body, details, page)
  values (p_topic, trim(p_email), nullif(trim(p_name),''), nullif(trim(p_body),''), coalesce(p_details,'{}'::jsonb), p_page);
end $$;
revoke all on function public.submit_message(text,text,text,text,jsonb,text) from public, authenticated;
grant execute on function public.submit_message(text,text,text,text,jsonb,text) to anon;
