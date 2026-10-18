-- "Who to call" contacts for the Wildlife page live in the help list as category 'wildlife'.
-- Applied with execute_sql in one transaction.
alter table public.help_resources drop constraint help_resources_category_check;
alter table public.help_resources add constraint help_resources_category_check
  check (category in ('food','vet','behavior','housing','rehoming','birds','wildlife'));
