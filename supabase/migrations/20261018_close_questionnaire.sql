-- The planning questionnaire is off the site. Close its public write path; the saved answers stay.
-- To reopen it: grant execute on function public.save_questionnaire(uuid, jsonb) to anon;
revoke execute on function public.save_questionnaire(uuid, jsonb) from anon, authenticated, public;
