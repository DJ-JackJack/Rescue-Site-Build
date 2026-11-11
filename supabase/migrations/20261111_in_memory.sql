-- "In memory": an outcome for an animal who has passed away, with the date if it's known (November 2026).
-- They stay on Happy Tales and in the adoption numbers like any other outcome; the site only gives them a quiet label.
alter table public.animals drop constraint animals_status_check;
alter table public.animals add constraint animals_status_check
  check (status in ('adopted','placed','foster','sanctuary','looking','unknown','passed'));

alter table public.animals add column if not exists passed_on date;
