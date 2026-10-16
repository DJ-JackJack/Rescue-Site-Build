# Pulling her questionnaire answers

Her answers live in the Supabase project **rescue-site** (`yysfgsdwlddeilktumza`), table `public.questionnaire_responses`, one row per phone or browser. This repo is public, so her answers must never be committed. Everything below writes into `responses/`, which is git-ignored.

## Quick progress check

Run this in the Supabase SQL editor, or through the Supabase connector in a Claude session:

```sql
select device_id, updated_at, save_count,
  (select count(distinct substring(k from '^q(\d+)')) from jsonb_object_keys(answers) k) as questions_answered
from public.questionnaire_responses
order by updated_at desc;
```

## Full transcript

1. Pull the rows:

   ```sql
   select device_id, created_at, updated_at, save_count, answers
   from public.questionnaire_responses
   order by updated_at desc;
   ```

2. Save the result as JSON to `responses/rows.json`. In a Claude session, ask Claude to do this; from the Supabase dashboard, use the export or copy the result as JSON.

3. Render it:

   ```sh
   node tools/render-answers.mjs responses/rows.json responses/answers.md
   ```

   The output matches the form's "Copy all my answers" text, followed by a "Checks for Krys" list: skipped questions, picks over the limit, conflicts between answers, and the privacy and permission items to respect.

4. Copy `docs/site-brief-template.md` to `responses/site-brief.md` and fill it in from the transcript.

## Notes

- More than one row means she used more than one device. Each is shown separately; merge them by hand, preferring the newest answer.
- Test rows from Krys's phone may appear. Krys's earlier test device started with `42e21e2b` and has been deleted; any new test row can be deleted from the Table Editor.
- The script reads the question wording out of `questionnaire/index.html`, so if the form changes, the transcript follows automatically.
