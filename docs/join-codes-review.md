# One way to join everything (invite codes + "Email the code") — feature review

Status: **review_required**. Built locally on `cam/explore-content` (project_specs.md "Feature: One way to join everything"); not committed. `supabase/join_codes.sql` not run on the live database yet. Resend isn't set up (`RESEND_API_KEY` / `EMAIL_FROM` missing), so no email is sent until it is.

## What it is

- **Codes everywhere:**
  - Play rounds with friends and Golf Trips get a 6-character invite code, as Tourneys and Leagues already have.
  - Each tab's Join box takes only its own codes (owner decision).
  - A round code joins the live round (up to 5 players). A trip code adds you straight in as a member (owner decision).
- **Emailing the code:**
  - The person running a round, trip, tourney or league can email the code to addresses they type.
  - Each email says "<sender's display name> invited you to <name>", shows the code, and has a Join link to that kind's own Join page.

## Findings

- **Personal data:**
  - Typed email addresses are used to send the email. They're kept in `email_invites_sent` (sender, kind, item, address, time) only so the caps work, and records older than 90 days are deleted on the next send.
  - They aren't used for anything else or shown to anyone.
  - The email contains no personal details beyond the sender's display name and the thing's name.
- **Abuse limits** (enforced in the database and tested against Postgres):
  - At most 50 emails per round, trip, tourney or league.
  - At most 200 a day per sender.
  - The same address once an hour for the same thing.
  - Only the host or organizer can send.
- **Marketing / anti-spam:**
  - These are one-to-one invitations a user asks to send, not marketing.
  - There's no unsubscribe link yet. Whether one is needed (CAN-SPAM / CASL and similar) is a **legal follow-up**. The caps keep the volume low.
- **Access:**
  - Codes only let someone see a short preview (name, who runs it, when and where, player count) and join.
  - Everything else stays members-only.
  - Someone a host removed from a round can't rejoin with the code.
  - A trip organizer can make a new code, and the old one stops working.
- **Retention:** 90 days for the send records (`email_invites_sent`). Trips, rounds, tourneys and leagues keep their existing retention.
- **Third party:** Resend, already used by tourney invites and friend requests. Its data-processing terms need checking. **Follow-up** (LR-02).

## Not verified

- **Real email sending:** Resend isn't configured.
- **A signed-in pass on the live database:** needs `supabase/join_codes.sql` to be run first.
