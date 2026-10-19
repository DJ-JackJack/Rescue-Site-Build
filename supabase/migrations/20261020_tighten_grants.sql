-- Supabase gives the public (anon) and signed-in (authenticated) roles every right on each new table by default.
-- Row-level security is what protects the rows, but these narrow the rights on the newer tables to what the site
-- and the edit page actually use, the same as the original tables: a second lock. New tables should do the same.
revoke all on public.help_resources, public.site_text, public.content_history, public.page_views, public.visit_sources from anon, authenticated;
grant select on public.help_resources, public.site_text to anon;
grant select, insert, update, delete on public.help_resources, public.site_text to authenticated;
grant select, delete on public.content_history to authenticated;
grant select on public.page_views, public.visit_sources to authenticated;
