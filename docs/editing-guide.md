# Editing the site from your phone

The edit page lives at **`/edit/`** on the site. Today that's
`https://dj-jackjack.github.io/Rescue-Site-Build/edit/`. It isn't in the menu, and search engines are told to skip it.

**Tip:** open it on your phone and use "Add to Home Screen". It then opens like an app, and you stay signed in.

## Signing in

Use your email and password. Let your phone save the password, and you'll only type it once.

Only accounts on the editor list can change anything. A new account goes on the list in two steps:

1. Create it in Supabase: Authentication → Users → Add user → Create new user. Tick "Auto Confirm User".
2. Add its email to the editor list.

Forgot your password? It can be reset in Supabase: Authentication → Users → pick the account.

## The start screen

**Needs attention** lists what's due, with one-tap buttons:

- **New messages** from the forms on the site.
- **A dog who's still looking and hasn't been checked in 3 weeks.**
  - Tap **Still available** once you've confirmed they're still at the shelter.
  - Tap **Adopted!** if they've gone home.
  - A dog who isn't checked for 4 weeks hides itself, so the site never shows a dog who's already gone.
- **Goal numbers that are getting old.** After 14 days, the site says "an update is coming" instead of showing old numbers.
- **Day-out programs and help listings** that haven't been checked in a while.

Below that, **Everything** has a button for each part of the site.

## Common jobs

| I want to… | Do this |
|---|---|
| Add a dog I filmed | Animals → **+ Add animal**. Fill in the name, tap **Still looking**, pick the rescue, add a photo and the link to their listing, then tap **Add**. |
| Mark a dog adopted | Open them, tap **Adopted** (today's date fills in by itself), then **Save changes**. Or use **Adopted!** on the start screen. |
| Tell an animal's story | Open them and scroll to **Their journey**. Tap **Fill in from the dates** for a start, or **+ Add a step** for each thing that happened ("Went to a foster home", "Adopted"). The arrows change the order. People see these steps when they tap the animal on Happy Tails. Left empty, the site makes them from the video and adoption dates. |
| Update a shelter goal | Shelter goals → the goal. Change the **So far** numbers and tap **Save changes**. The "updated" date on the site changes by itself. |
| Finish a goal | Open it, tap **Goal met 🎉**, then save. It moves to "Goals met". |
| Add an event | Events → **+ Add event**. Events disappear from the site by themselves the day after. |
| Add a rescue | Rescues & shelters → **+ Add**. Use their full proper name. They only show once **"They've said yes to being featured"** and **"Show on the site"** are both on. |
| Add local help | Local help list → **+ Add**. It shows on the "Help keeping your pet" page under its kind of help. |
| Change wording | Page wording. Edit the words and tap **Save**. "Go back to the original words" undoes it. |
| Answer a message | Messages → **Reply by email** opens your email app. Then tap **Mark done**. |
| Undo a delete | **Recently deleted** → **Restore**. Anything deleted in the last 90 days comes back just as it was. |
| See how many people visit | **Visitors**. Page views for the last 7 days, 30 days or 12 months, which pages are popular, and where visitors came from. |

## Good to know

- **Changes show on the site straight away.** Refresh the page to see them.
- **Hide, don't delete.** Turning off "Show on the site" hides something and keeps everything. If you do delete something by mistake, it stays in **Recently deleted** for 90 days.
- **Links in your bios:** add `?from=tiktok` (or `?from=instagram`, `?from=youtube`) to the site link, so Visitors can tell where people came from. Visits from inside those apps often show as "Direct" otherwise.
- **Your own visits don't count** while you're signed in here. On the Visitors screen you can also skip a phone or computer when it's signed out.
- **Photos:** pick any photo from your phone. The edit page shrinks it and strips hidden data (like where it was taken) before uploading. Still check the background: no house, street, plates or mail.
- **Private stuff never goes in:** no home addresses, no wildlife release spots, no names of people who haven't said yes.
- **Messages** are only visible to signed-in editors.
