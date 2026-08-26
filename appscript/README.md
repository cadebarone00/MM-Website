# Hooking up the live feed and the scoring tools (one-time setup)

This makes your Google Sheet talk to both the public website (reads scores) and the website's own scoring tools under `/portal/host` and `/portal` (writes scores). You only have to do this once — after it's set up, everything just works.

## What you're doing, in plain terms

You're going to paste two small scripts into your Google Sheet, as two separate files in the same project. One reads your Roster, Leaderboard, and Player Data Pull tabs and hands them to the website. The other handles score writes — pairings, rounds, and the host tools — trusting a shared secret that only the website's own server knows. Then you'll turn the whole project into one "Web App" — Google gives it a public web address that handles both jobs automatically.

## Steps

1. Open the **2027 Maroon Masters** Google Sheet (the real one, not the Excel file).
2. Click **Extensions** in the top menu → **Apps Script**. This opens a new tab with a code editor.
3. You'll see a file with some placeholder code already in it (probably named `Code.gs`). Select all of it and delete it.
4. Open `live-feed.gs` from this folder, copy everything in it, and paste it into that empty editor.
5. Click the **+** next to "Files" on the left → **Script** → name it `write-scores` (it'll save as `write-scores.gs`). Open `write-scores.gs` from this folder, copy everything in it, and paste it into that new file.
6. Click the **Save** icon (looks like a floppy disk) near the top.
7. Click the blue **Deploy** button (top right) → **New deployment**.
8. Click the gear icon ⚙️ next to "Select type" → choose **Web app**.
9. Fill in:
   - **Description**: anything, e.g. "live feed"
   - **Execute as**: Me (your account)
   - **Who has access**: **Anyone** — this needs to be public so the website can reach it without you logging in every time. Writes are still locked down by the shared secret inside the script itself, not by who can reach the URL.
10. Click **Deploy**.
11. Google will probably ask you to authorize it — click through that (it's your own script asking permission to read/edit your own sheet).
12. You'll get a URL that looks like `https://script.google.com/macros/s/AKfycb.../exec`. **Copy that whole URL and send it to me** — that's the one thing I need from you to finish wiring up the website.

## Setting the scoring server secret

The website's own server talks to this script using a shared secret — a password only the two of them know, not something anyone types into a screen.

1. Pick any long random-ish value (e.g. generate one at a site like 1password.com/password-generator, or just mash the keyboard for 30+ characters).
2. Close the Apps Script tab and go back to the actual Google Sheet. Reload the page. A new menu called **Maroon Masters** should appear in the menu bar next to Help.
3. Click **Maroon Masters → Set Scoring Server Secret**, paste in the value you picked.
4. Send me that same value — it goes into the website's `SCOREKEEPER_SERVER_SECRET` setting. Both sides have to match exactly.

## How the trip actually runs

1. **Pairings tab** (`/portal/host` → Pairings): before each round, set up that round's matches — pick players for Maroon and White in click order (1st click = Slot 1, 2nd click = Slot 2). Slot 1 vs Slot 1 and Slot 2 vs Slot 2 track each other's stats that round — that's automatic, you don't set it separately.
2. **Rounds tab** (`/portal/host` → Rounds): a round only accepts scores once you click **Start** for it. Until then, players see "waiting for the host to start Round N." If you need to wipe a round's entries and redo it, **Reset** clears just that round's scores — pairings are untouched.
3. Players log into `/portal` with their regular site account (same login as everywhere else on the site) and see two tabs: **My Score** and **[Partner]'s Score** — whoever their Pairings slot-counterpart is that round.

## New tabs you'll see appear on their own

You don't need to create these — the app manages them: **Pairings** (round groupings you set up from `/portal/host`), **Round State** (which rounds you've started). Leave them alone unless you're fixing a typo'd name.

## If you ever edit the scripts later

Any time you change the code in `live-feed.gs` or `write-scores.gs`: paste the updated code into the same Apps Script editor, save, then **Deploy → Manage deployments → click the pencil/edit icon on the existing deployment → Version: New version → Deploy**. This keeps the same URL, so you don't need to send anyone a new one.

## One thing to watch for on the sheet itself

If you ever build a new player's row by copying an existing player's whole block of rows in **Player Data Pull** (instead of typing it from scratch), make sure you also update that player's name everywhere it appears in that block — not just the visible name, but the little internal labels too (things like `KylePlayed`, `KyleScore` in the hidden helper column). If you copy Kyle's block to make a new player and forget to rename those, the website will show that new player's scores under Kyle's name instead. This happened once in the 2026 sheet and I had to untangle it by hand — easy to avoid by just double-checking the copied block's labels before moving on.
