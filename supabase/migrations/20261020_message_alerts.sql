-- Phone notifications for new messages (the notify-message Edge Function sends them).
-- push_subscriptions: editors' phones and computers that turned notifications on (edit page > Messages).
-- push_state: the VAPID keys notify-message makes on first use. Only the server can read it.
-- messages.notified_at: set once a message has been announced, so each one is announced once.
-- After each new message, the database asks notify-message to announce it, through pg_net, which sends the
-- request after the message is saved: the form never waits on it, and a problem there can't lose a message.

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_subscriptions (
  endpoint text primary key check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 60 and 120),
  auth text not null check (length(auth) between 16 and 44),
  email text not null check (length(email) <= 200),
  device text check (length(device) <= 40),
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_admin on public.push_subscriptions for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create table if not exists public.push_state (
  id int primary key default 1 check (id = 1),
  vapid_public text,
  vapid_private jsonb
);
alter table public.push_state enable row level security;
revoke all on public.push_state from anon, authenticated;
insert into public.push_state (id) values (1) on conflict do nothing;

alter table public.messages add column if not exists notified_at timestamptz;
update public.messages set notified_at = created_at where notified_at is null; -- messages from before this were already seen

-- Marks the messages that haven't been announced yet as announced, and returns them (topic and name only).
create or replace function public.push_claim() returns jsonb
language sql security definer set search_path = '' as $$
  with claimed as (
    update public.messages set notified_at = now()
    where notified_at is null and created_at > now() - interval '1 day'
    returning topic, name, created_at)
  select jsonb_build_object(
    'messages', coalesce((select jsonb_agg(jsonb_build_object('topic', topic, 'name', left(name, 80)) order by created_at) from claimed), '[]'::jsonb),
    'unhandled', (select count(*) from public.messages where not handled));
$$;
revoke execute on function public.push_claim() from public, anon, authenticated;
grant execute on function public.push_claim() to service_role;

create or replace function public.messages_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform net.http_post(
      url := 'https://yysfgsdwlddeilktumza.supabase.co/functions/v1/notify-message',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 10000);
  exception when others then
    raise warning 'messages_notify: %', sqlerrm; -- an alert problem must never stop a message from saving
  end;
  return null;
end $$;
revoke execute on function public.messages_notify() from public, anon, authenticated;
create trigger messages_notify after insert on public.messages for each statement execute function public.messages_notify();
