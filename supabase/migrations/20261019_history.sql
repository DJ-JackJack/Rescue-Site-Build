-- Recently deleted and earlier versions: every change or delete made to the site's content keeps a copy of the
-- row as it was, for 90 days. Only editors can see the copies. The edit page lists deleted things under
-- "Recently deleted" with a Restore button; earlier versions of edited rows can be put back with SQL.
-- Messages keep a copy only when deleted (not when marked done).

create table if not exists public.content_history (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  tx bigint not null default txid_current(),  -- one delete can remove several rows (a goal and its lines)
  tbl text not null,
  op text not null check (op in ('update','delete')),
  row_key text not null,
  data jsonb not null,                          -- the row as it was before the change
  by_email text,
  restored_at timestamptz
);
create index if not exists content_history_at on public.content_history (at);
create index if not exists content_history_tx on public.content_history (tx);
alter table public.content_history enable row level security;
create policy history_admin_read on public.content_history for select to authenticated using (public.is_admin());
create policy history_admin_delete on public.content_history for delete to authenticated using (public.is_admin());
grant select, delete on public.content_history to authenticated;

create or replace function public.keep_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.content_history (tbl, op, row_key, data, by_email)
  values (tg_table_name, lower(tg_op), coalesce(to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'key'), to_jsonb(old), lower(auth.jwt() ->> 'email'));
  delete from public.content_history where at < now() - interval '90 days';
  return null;
end $$;
revoke execute on function public.keep_history() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['animals','goals','goal_bars','events','partners','sniffari_programs','help_resources','site_text'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_history', t);
    execute format('create trigger %I after update or delete on public.%I for each row execute function public.keep_history()', t || '_history', t);
  end loop;
end $$;
drop trigger if exists messages_history on public.messages;
create trigger messages_history after delete on public.messages for each row execute function public.keep_history();

-- Puts back a deleted row, and anything deleted along with it (a goal's lines).
create or replace function public.restore_deleted(p_id bigint) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_tx bigint;
  e record;
  n int := 0;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select h.tx into v_tx from public.content_history h where h.id = p_id and h.op = 'delete' and h.restored_at is null;
  if v_tx is null then raise exception 'That one was already restored or is too old.'; end if;
  for e in
    select h.id, h.tbl, h.data from public.content_history h
    where h.tx = v_tx and h.op = 'delete' and h.restored_at is null
    order by array_position(array['partners','goals','goal_bars','animals','events','sniffari_programs','help_resources','messages','site_text'], h.tbl), h.id
  loop
    if e.tbl not in ('partners','goals','goal_bars','animals','events','sniffari_programs','help_resources','messages','site_text') then continue; end if;
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) on conflict do nothing', e.tbl, e.tbl) using e.data;
    update public.content_history set restored_at = now() where id = e.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.restore_deleted(bigint) from public, anon;
grant execute on function public.restore_deleted(bigint) to authenticated;
