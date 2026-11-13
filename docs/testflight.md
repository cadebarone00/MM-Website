# Putting The Maroon on TestFlight (new Mac)

TestFlight is Apple's app for sending test versions to your friends before the app is in the App Store.

## Once, on the new Mac

1. **Install Xcode.**
   - Open the App Store on the Mac, search **Xcode**, and click **Get**. It's free and big (about 15 GB).
   - Open Xcode once and let it finish "installing components". Choose **iOS** when it asks.
2. **Sign in to your Apple developer account.**
   - In Xcode, go to **Xcode → Settings → Accounts → +**, choose **Apple ID**, and sign in.
   - The account must be in the Apple Developer Program ($99 / year, at developer.apple.com/programs).
3. **Install the tools.**
   - Install Node.js (the "LTS" button on nodejs.org) and Git (Xcode installs it).
   - Open **Terminal** and run these three commands:
     ```
     git clone <your GitHub repo address>
     cd MM-Website
     npm install
     ```
4. **Add the app's settings file.**
   - Copy the `.env` file from the old Mac into the `MM-Website` folder.
   - Use a USB stick or AirDrop. Never email it or paste it anywhere, because it holds your secret keys.
5. **Create the app in App Store Connect.**
   - Go to appstoreconnect.apple.com → **Apps → + → New App**.
   - Fill it in:
     - Platform: iOS
     - Name: The Maroon
     - Bundle ID: `site.themaroon.app`
     - SKU: `themaroon`
   - If the Bundle ID isn't in the list, first add it at developer.apple.com → **Certificates, IDs & Profiles → Identifiers → +**.

## Before the first upload: let the app reach the live site

The app gets everything (sign-in, trips, scores) from themaroon.site, so two things must be true first.

1. **The app's code must be on the live site.** The app uses new server addresses (`/api/app/…`) that only exist after this code is pushed to `main` and Vercel deploys it.
2. **The live site must not be behind a Vercel login.**
   - On 2026-11-12, every page of themaroon.site sent visitors to a Vercel sign-in page ("Vercel Authentication"). The app can't get past that.
   - To fix it, go to vercel.com → your project → **Settings → Deployment Protection** → set **Vercel Authentication** to **Disabled**, or to **Only Preview Deployments** so that only test copies stay locked. Then click **Save**.
   - This makes the live site public. It still has its own sign-in for accounts.
   - Check it worked: open themaroon.site in a private browser window. You should see The Maroon, not a Vercel login.

## Every time you upload a new test version

1. **Build the app.** In Terminal, in the `MM-Website` folder, run `npm run build:app`.
   - This packages every screen into the iPhone project.
   - Wait for it to finish with no red errors.
2. **Open the project in Xcode.** Run `npx cap open ios`.
3. **The first time only:** click **App** in the left list → **Signing & Capabilities** → **Team** → pick your developer account.
4. **Raise the build number.**
   - Click **App** → **General** → **Build** and add 1 (1 → 2 → 3…). Apple refuses two uploads with the same number.
   - Put the same number in `lib/app/appVersion.ts` (`APP_BUILD`).
5. **Archive the app.**
   - At the top of Xcode, set the device to **Any iOS Device (arm64)**.
   - Click **Product → Archive** and wait a few minutes.
6. **Upload it.** When the Organizer window opens, click **Distribute App → App Store Connect → Upload**, then **Next** until it's done.
7. **Wait for Apple to process it.** This takes about 10–30 minutes.
   - In App Store Connect → your app → **TestFlight**, the build appears.
   - Answer the "export compliance" question: **None of the algorithms mentioned** (the app only uses standard HTTPS).
8. **Invite testers.**
   - Under **TestFlight → Internal Testing → +**, add people by their Apple ID email.
   - They install the **TestFlight** app on their iPhone and tap the invite.

## If an old test version breaks

On Vercel, set `MAROON_APP_MIN_BUILD` to the newest build number (Project → Settings → Environment Variables), then redeploy.

Anyone on an older build sees "Update The Maroon" until they update in TestFlight.
