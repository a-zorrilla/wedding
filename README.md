# Anna & Alec — Wedding Studio

The live wedding-planning website at https://a-zorrilla.github.io/wedding/ (GitHub Pages, branch `main` at root). Shared data is stored in Supabase project `iorausxqwrlggudtklib` and protected by Supabase Auth and workspace row-level security (RLS).

## App sections

- **Overview:** Live guest RSVP headcount, guest card count, venue count, shortlist count, and shortcuts.
- **Guest list:** Full original October 2026 guest-list app (board with drag/drop and three columns, per-card status, party linking, plus-one flags, filters, summary/drilldowns, tags, relationship/side fields, wedding party, JSON download/restore, notes, ordering, duplicate-name confirmation). The UI uses the original guest app's logic in `guest-list.js` and styles in `guest-list.css`.
- **Venues:** Add/edit/delete venues, searches and filters, ratings, statuses, guest capacity, budget, tour date, pros/cons/notes, website and contact, CSV export.

## Imported guest data

The supplied `wedding-invites-2026-10-12.json` backup was loaded directly into **the existing shared Supabase workspace** (`3def185e-a080-4290-acfd-10777bd08b47`). It was **not** added to the public GitHub repository. Validated snapshot: 144 named guests, 38 linked parties, 83 invited cards, 91 invited headcount including unnamed plus-ones. Original person IDs, party IDs, tags, statuses, and ordering are preserved. Import used `ON CONFLICT DO NOTHING` to avoid overwriting any future guest list. This backup is only known to be current as of October 12; if the original browser contains more recent edits, export its backup and restore the newer one intentionally via the new Guest list page.

## Working together

1. Both partners have distinct Supabase Auth accounts.
2. Sign in at the site; the shared `Our Wedding` workspace is shown automatically to its members.
3. Save venue edits to the cloud. Guest edits use an optimistic revision check (to prevent unnoticed overwrites) and a small debounce; the browser keeps a temporary emergency guest draft until saved.
4. To add a new member who is not already joined, share the private workspace invite link from the earlier app or provide an invitation flow (future feature). Existing members are unchanged by this update.
5. Guest list JSON **Download backup** and **Restore backup** remain available. Restore **replaces** the entire shared guest list after confirmation. If there are concurrent edits, the app refuses stale saves and prompts you to download a backup before reloading. Guest list prior revisions are automatically logged to `wedding_private.guest_list_history` by a database trigger.

## Code

- `index.html` — shared shell, app tabs, original guest board markup, venue forms.
- `site.css` — new editorial styling, responsive layout, common colors/typography.
- `guest-list.css` — original visual guest board styles (with site-wide overrides in `site.css`).
- `guest-list.js` — original guest tracker functionality, adapted only for shared snapshot persistence (not browser-only localStorage) and new `GuestListApp` interface.
- `main.js` — Supabase connection, authentication, navigation, guest syncing, venue CRUD and dashboard.

This is a static app (no build step, no private API key in source). The Supabase publishable key in `main.js` is intended to be public; row-level security controls access. Do **not** commit personal guest backups, database credentials, or service-role keys to this public repo.

## Notes

- Realtime subscriptions refresh remote venue and guest updates. Guest list conflict protection uses the database `revision` column. The app warns rather than overwrite a remote guest snapshot when both devices edit the list simultaneously. Avoid simultaneous guest-list edits when possible.
- Browser emergency guest draft is keyed per workspace in localStorage. It is cleared after a successful cloud save. It is not an additional workspace or a source of truth.
- To publish code changes, commit to `main`; GitHub Pages should redeploy automatically.