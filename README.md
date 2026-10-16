# Rescue-Site-Build

Planning materials for the rescue and wildlife website.

- `questionnaire/index.html` is the phone-friendly planning questionnaire. It is a single static page with no build step. Answers save in the browser on the device being used (localStorage) and also sync, about a second after each change, to the `questionnaire_responses` table in the Supabase project "rescue-site". The "Copy all my answers" button at the bottom is a backup for when syncing fails.
- `supabase/migrations/` holds the SQL for that table. The page uses the public publishable key, which can only call the write-only `save_questionnaire` function; reading answers requires the Supabase dashboard (Table Editor, `questionnaire_responses`).
- `questionnaire/Website_Planning_Questionnaire.pdf` is the same 50 questions as a fillable PDF, for use on a computer with Adobe Acrobat Reader.
- `index.html` at the root redirects to the questionnaire, so the GitHub Pages address works on its own.
