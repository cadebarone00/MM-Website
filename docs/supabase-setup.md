# Setting up Supabase (one-time)

This is what makes Sign Up / Login actually work. You only have to do this once.

## What you're doing, in plain terms

You're creating a free account on Supabase (a hosted database + login
service), creating one project for the Maroon Masters site, pasting in one
SQL script that creates two tables, then copying three keys into `.env` so
the website can talk to it.

## Steps

1. Go to https://supabase.com and sign up (free tier is enough).
2. Click **New Project**. Name it `maroon-masters`, pick any region close to
   you, set a database password (save it somewhere — you likely won't need
   it again, Supabase manages the connection for you).
3. Once the project finishes provisioning, open the **SQL Editor** (left
   sidebar) -> **New query**. Paste in everything from `supabase/schema.sql`
   in this repo and click **Run**. This creates the two tables the site
   needs (`profiles`, `player_slots`) and pre-fills `player_slots` with all
   13 current players (usernames still blank until you set them later on
   the site's `/portal/admin` page).
4. Go to **Project Settings** (gear icon) -> **API**.
   - **Project URL** -> copy into `.env` as `SUPABASE_URL`.
   - **Project API keys** -> **anon public** key -> copy into `.env` as
     `SUPABASE_ANON_KEY`.
   - **service_role** key (click "reveal") -> copy into `.env` as
     `SUPABASE_SERVICE_ROLE_KEY`. This one is powerful — it can bypass all
     the security rules, so it only ever lives in `.env` (never in code,
     never committed, never sent to a browser).
5. Go to **Authentication** -> **Providers** -> **Email**, and confirm
   **Confirm email** is turned ON (it's on by default) — this is what makes
   people verify their email before they can log in.
6. Still in **Authentication**, go to **URL Configuration**. Under **Redirect URLs**, add:
   - `http://localhost:3001/**` (for local development — note the site runs on port 3001, not Supabase's default 3000)
   - Your production URL once you have one, e.g. `https://your-site.vercel.app/**`

   Without this, the links in verification and password-reset emails will silently point at the wrong address.
7. Copy `.env.example` to `.env` and paste in the three values from step 4.
8. Run `npm install` (pulls in the two new packages this needs), then
   `npm run dev` and try signing up on `/signup`.

## Deploying to production (Vercel)

The three keys from step 4 also need to be added to your live site, not just your local `.env`:

1. Go to your Vercel dashboard → your project → **Settings** → **Environment Variables**.
2. Add all three: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — same values as your local `.env`.
3. Redeploy (or it'll pick them up on the next deploy automatically).

Without these, the whole site — not just sign-up/login — will error on every page, since a background check runs on every request.

## Becoming Tiger (the host)

There's no self-service way to become the host — it's a one-time manual step you do for your own account:

1. Sign up normally on `/signup` with your own account, and verify your email.
2. In the Supabase Dashboard → **Table Editor** → `profiles`, find your row (by your email) and edit its `is_host` column from `false` to `true`.
3. Log out and back in. You'll now see the Website/Portal fork screen, and `/portal` will show a "Tiger" landing with a link to the player-username admin page.

## If you ever need to see who's signed up

Supabase Dashboard -> **Table Editor** -> `profiles` shows every account.
**Authentication** -> **Users** shows the underlying login records (email,
verified status).
