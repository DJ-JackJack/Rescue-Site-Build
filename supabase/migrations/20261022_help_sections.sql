-- From Taea's list of 2026-10-22: the help page gets its own sections for credit cards and loans, reporting
-- animal abuse, and wildlife groups and sanctuaries (next to the existing "who to call" wildlife contacts).
alter table public.help_resources drop constraint help_resources_category_check;
alter table public.help_resources add constraint help_resources_category_check
  check (category in ('food','vet','behavior','housing','rehoming','birds','financing','abuse','wildlife','wildgroups'));

-- Credit cards and loans say what they are and what they're best used for, so nobody mistakes them for free help.
alter table public.help_resources add column if not exists kind text check (length(kind) <= 40);       -- like "Credit card" or "Loan"
alter table public.help_resources add column if not exists best_for text check (length(best_for) <= 300);

-- CareCredit moves from vet bills to the new section. It stays hidden until Taea switches it on.
update public.help_resources set category = 'financing', kind = 'Credit card' where name ilike 'CareCredit%';
