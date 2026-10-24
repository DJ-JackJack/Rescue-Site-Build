-- Privacy audit, 2026-10-24.
--
-- Copies of edited and deleted things (content_history, the edit page's "Recently deleted") are cleared out every
-- night once they're 90 days old, as the Privacy page says. Before this they were only cleared when something was
-- next edited, so a deleted message could outlast its 90 days on a quiet week.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'clear-old-history';
select cron.schedule('clear-old-history', '23 7 * * *', $$delete from public.content_history where at < now() - interval '90 days'$$);
