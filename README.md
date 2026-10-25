# Wedding Venue Tracker

Collaborative wedding venue planning app hosted as a static HTML site using Supabase Auth and Postgres.

## Features
- Email/password accounts, private shared workspace and partner invitation links
- Create, edit, delete and compare venues; ratings, budget, status, tour dates, and notes
- Search, status filter, sort, dashboard counts, CSV export
- Shared cloud data protected with PostgreSQL row-level security
- Live update subscriptions (plus manual Refresh)

## Publish with GitHub Pages

1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select **main** and **/(root)**, then **Save**.
4. Open the displayed GitHub Pages URL (normally https://a-zorrilla.github.io/wedding/ ).

## First use
1. Create your account; confirm email if asked.
2. Sign in and create a workspace.
3. Select **Copy partner invite link**, share it privately.
4. Your partner opens the link, creates an account, signs in, and joins with the invitation code.

The invite link is a secret: anyone who obtains it and signs in can join your workspace. Keep it private.

## Supabase project
- Project ID: `iorausxqwrlggudtklib`
- Public API URL and publishable key are included in `index.html`. This is normal for a browser application, since access is controlled by Supabase Auth + row-level security.
- The database schema has been applied through the connected Supabase project.

For login, confirm email authentication is enabled in **Supabase Dashboard → Authentication → Providers → Email**. Configure **Authentication → URL Configuration** with the published site URL as Site URL (and allowed redirect URL if needed).

## Development
This site is plain HTML, CSS and JS with no build step. Edit `index.html` and push to `main` to publish new versions.
