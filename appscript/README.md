# Hooking up the live feed and the scorekeeper app (one-time setup)

This makes your Google Sheet talk to both the public website (reads scores) and the scorekeeper app (writes scores). You only have to do this once — after it's set up, both apps just work.

## What you're doing, in plain terms

You're going to paste two small scripts into your Google Sheet, as two separate files in the same project. One reads your Roster, Leaderboard, and Player Data Pull tabs and hands them to the website. The other handles everything in the scorekeeper app — player codes, pairings, rounds, and the host tools. Then you'll turn the whole project into one "Web App" — Google gives it a public web address that handles both jobs automatically.

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
   - **Who has access**: **Anyone** — this needs to be public so the website and scorekeeper app can reach it without you logging in every time. Writes are still locked down by code/password checks inside the script itself, not by who can reach the URL.
10. Click **Deploy**.
11. Google will probably ask you to authorize it — click through that (it's your own script asking permission to read/edit your own sheet and send email as you; the email part is new since codes now get emailed out).
12. You'll get a URL that looks like `https://script.google.com/macros/s/AKfycb.../exec`. **Copy that whole URL and send it to me** — that's the one thing I need from you to finish wiring up both the website and the scorekeeper app.

## Setting your host password

The scorekeeper app has a second way in besides player codes: a Host login (username + password) that's just for you — full access to every player's scores and stats, the ability to edit anyone's scores directly, and screens for setting up pairings, issuing codes, and starting/resetting rounds.

1. Close the Apps Script tab and go back to the actual Google Sheet.
2. Reload the page. A new menu called **Maroon Masters** should appear in the menu bar next to Help.
3. Click **Maroon Masters → Set Host Password**.
4. It'll ask for a username, then a password, one at a time — type whatever you want.
5. Log into the scorekeeper app's Host section with whatever you just typed. Your password is never stored as plain text — only a scrambled version that can't be reversed.

## Setting up player emails

Codes get emailed to players from whatever Google account you used to authorize this script (should be your own). The list of players and their email addresses lives in a **Player Emails** tab.

1. From the same **Maroon Masters** menu, click **Set Up Player Emails**.
2. This creates the tab pre-filled with everyone's email address from our setup conversation (Jackson's is left blank since we don't have one yet).
3. You can edit that tab directly anytime — add Jackson's email once you have it, fix a typo, add a new player. No need to ask me.
4. Running **Set Up Player Emails** again later won't overwrite anything if the tab already exists — it just lets you know it's already set up.

## How the trip actually runs

1. **Pairings tab** (host app → Pairings): before each round, set up that round's matches — pick players for Maroon and White in click order (1st click = Slot 1, 2nd click = Slot 2). Slot 1 vs Slot 1 and Slot 2 vs Slot 2 track each other's stats that round — that's automatic, you don't set it separately.
2. **Player Codes tab** (host app → Player Codes): each player gets ONE code for the whole trip, not a new one per round. Generate codes once near the start of the trip (Generate All → Submit), which emails everyone their code. If someone's code ever stops working, use "New Code" next to their name — that re-sends just to them.
3. **Rounds tab** (host app → Rounds): a round only accepts scores once you click **Start** for it. Until then, players see "waiting for the host to start Round N." If you need to wipe a round's entries and redo it, **Reset** clears just that round's scores — codes and pairings are untouched.
4. Players log into the scorekeeper app under **Player** with their one code. Each round they're logged into, they see two tabs: **My Score** and **[Partner]'s Score** — whoever their Pairings slot-counterpart is that round.

## New tabs you'll see appear on their own

You don't need to create these — the app manages them: **Host Login** (your username + scrambled password), **Player Emails** (seeded once via the menu, editable anytime), **Pairings** (round groupings you set up from the app), **Player Codes** (one persistent code per player), **Round State** (which rounds you've started). Leave them alone unless you're fixing an email address or a typo'd name.

## If you ever edit the scripts later

Any time you change the code in `live-feed.gs` or `write-scores.gs`: paste the updated code into the same Apps Script editor, save, then **Deploy → Manage deployments → click the pencil/edit icon on the existing deployment → Version: New version → Deploy**. This keeps the same URL, so you don't need to send anyone a new one.

## One thing to watch for on the sheet itself

If you ever build a new player's row by copying an existing player's whole block of rows in **Player Data Pull** (instead of typing it from scratch), make sure you also update that player's name everywhere it appears in that block — not just the visible name, but the little internal labels too (things like `KylePlayed`, `KyleScore` in the hidden helper column). If you copy Kyle's block to make a new player and forget to rename those, the website will show that new player's scores under Kyle's name instead. This happened once in the 2026 sheet and I had to untangle it by hand — easy to avoid by just double-checking the copied block's labels before moving on.
