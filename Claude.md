# Project Overview


Build a lightweight web application. This guide is instructions to get Claude Code to behave the way I want.
Each feature does one thing, the code is easy to follow, and the app is easy to run locally and deploy.


---


# Development Rules


**Rule 1: Always read first**
Before taking any action, always read:
- `CLAUDE.md`
- `project_specs.md`


If either file doesn't exist, create it before doing anything else.


**Rule 2: Define before you build**
Before writing any code:
1. Create or update `project_specs.md` and define:
  - What the app does and who uses it
  - Tech stack (framework, database, auth, hosting)
  - Pages and user flows (public vs authenticated)
  - Data models and where data is stored
  - Third-party services being used (Stripe, Supabase, etc.)
  - What "done" looks like for this task
2. Show the file
3. Wait for approval


No code should be written before this file is approved.


**Rule 3: Look before you create**
Always look at existing files before creating new ones. Don't start building until you understand what's being asked. If anything is unclear, ask before starting.


**Rule 4: Test before you respond**
After making any code changes, run the relevant tests or start the dev server to check for errors before responding. Never say "done" if the code is untested.


**Core Rule**
Do exactly what is asked. Nothing more, nothing less. If something is unclear, ask before starting.


---


# How to Respond


Always explain like you're talking to a 15 year old with no coding background.


For every response, include:
- **What I just did** — plain English, no jargon
- **What you need to do** — step by step, assume they've never seen this before
- **Why** — one sentence explaining what it does or why it matters
- **Next step** — one clear action
- **Errors** — if something went wrong, explain it simply and say exactly how to fix it


When a task involves external tools or technical elements that a non-coder wouldn’t know (Supabase, Vercel, Stripe, localhost:3000, etc.):
- Walk through exactly where to find what they need (e.g. "go to your Supabase dashboard → Settings → API")
- Describe what each key or setting does in one plain sentence
- If there's SQL to run, explain what it's doing before they run it
- If there's a bucket, folder, or config to create manually, explain what it is and why it exists
- Be as concise as possible. Do not ramble. Less is more


---


# Tech Stack


- **Language:** Python 3.9+
- **AI:** Claude API (`claude-sonnet-4-6`) via `anthropic` SDK
- **Key libraries:** <!-- e.g. pdfplumber, PyMuPDF, requests, BeautifulSoup -->


---


# Running the Project


<!-- Update these steps for your project. -->


1. Copy `.env.example` to `.env` and fill in your API keys
2. Install dependencies: `pip install -r requirements.txt`
3. Run: `python3 src/main.py`


---


# File Structure


<!-- Update paths if your project uses a different structure. -->


- `/src` → All application code
- `/out` → Generated output files (not committed to GitHub)
- `.env` → Your API keys and secrets (never share or commit this)
- `.env.example` → A safe template showing which keys are needed
- `project_specs.md` → What this project does and what needs to be built
- `requirements.txt` → List of Python packages needed to run the project


Put new code in the same place as similar existing code.
Don't create new top-level folders without asking first.


---


# How to Write Code


- Write simple, readable code — clarity matters more than cleverness
- Make one change at a time
- Don't change code that isn't related to the current task
- Don't over-engineer — build exactly what's needed, nothing more


If a big structural change is needed, explain why before making it.


---


# Secrets & Safety


- Never put API keys or passwords directly in the code
- Never commit `.env` to GitHub
- Ask before deleting or renaming any important files


---


# Scope


Only build what is described in `project_specs.md`.
If anything is unclear, ask before starting.


---


# Core Rule


Do exactly what is asked. Nothing more, nothing less.
If something is unclear, ask before starting.


# Testing


Before marking any task as done:
- Run the relevant script or command and confirm it exits successfully
- Check stdout/stderr for errors, warnings, or unexpected output
- Trace the full execution path end-to-end — not just the entry point
- Verify that existing behaviour wasn't broken by the change


When building a new workflow step or tool:
- Test the happy path (expected inputs produce expected outputs)
- Test the error path (bad inputs, missing data, or downstream failures are handled gracefully)
- Check that auth/permissions are working — API keys, scopes, and access controls behave correctly
- Confirm data is scoped and passed correctly between steps (no leakage, no missing context)


When calling external APIs or services:
- Confirm the request payload matches the expected schema
- Validate the response before passing it downstream
- Handle rate limits, timeouts, and partial failures explicitly


Never say "done" if:
- The workflow errors out or exits with a non-zero code
- Any step produces unexpected or unvalidated output
- The full execution path hasn't been traced end-to-end
- Edge cases (empty input, missing fields, API failures) haven't been considered
