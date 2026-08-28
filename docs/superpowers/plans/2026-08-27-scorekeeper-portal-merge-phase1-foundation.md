# Scorekeeper Portal Merge — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap MM-Scorekeeper's Python backend (`maroon-masters-python-api`) from its own host/player login system to the same trusted-server-secret model already used for the Google Sheet, then prove end-to-end that MM-Website's `/portal` (Supabase-authenticated) can reach it — so every later phase (profiles, host tools, course admin, etc.) has a working, secure pipe to build on.

**Architecture:** MM-Website's Next.js server becomes the *only* client of the Python API. It resolves player/host identity from the Supabase session server-side (never trusting anything client-supplied), then calls Python with one shared secret (`PYTHON_API_SECRET`) plus that resolved identity — mirroring the exact pattern `appscript/write-scores.gs`'s `checkServerSecret` already uses for the Sheet. Python's own login endpoints, session tokens, and hardcoded bypass codes are removed; its business logic, Postgres database, and real data are untouched.

**Tech Stack:** Next.js 16 App Router (Route Handlers), TypeScript, Supabase (`@supabase/ssr`), Python 3 / FastAPI (`cadebarone00/MM-Scorekeeper` repo, `backend/`), `pytest` for backend tests, `node:test` via `tsx` for frontend tests.

**Spec:** `docs/superpowers/specs/2026-08-27-scorekeeper-portal-merge-design.md`

## Global Constraints

- Nothing player- or host-supplied is ever trusted as identity by the Python API — identity is always a value MM-Website's server resolved from the Supabase session and passes explicitly, never decoded from a caller-supplied token.
- `PYTHON_API_SECRET` must never reach the browser — every call to the Python API happens server-side only, in a Route Handler or Server Component, exactly like `SCOREKEEPER_SERVER_SECRET` today.
- No changes to `appscript/live-feed.gs`, `/api/live-feed`, `lib/data/live.ts`, `lib/data/liveFeedNormalize.ts`, or any public `/leaderboard`, `/teams`, `/schedule`, `/history` page.
- No changes to MM-Scorekeeper's business logic (`scoring.py`, `orchestration.py`, `models.py`) or its Postgres schema/data — this phase only touches auth.
- Match existing code style: this repo's Route Handlers follow `app/api/portal/score/*/route.ts`'s pattern (see `lib/portal/requirePlayer.ts`, `lib/scorekeeper/client.ts`); MM-Scorekeeper's Python follows its existing `service.py`/`api.py` structure and `backend/tests/*` conventions (`pytest`, `fastapi.testclient.TestClient`, `monkeypatch` for env vars).
- Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` in MM-Website before considering any MM-Website task done. Run `cd backend && python -m pytest` in MM-Scorekeeper before considering any MM-Scorekeeper task done.
- Two repos, two working directories: MM-Website at `c:\Users\Owner\Documents\GitHub\MM-Website`, MM-Scorekeeper at `c:\Users\Owner\Documents\GitHub\MM-Scorekeeper`. Commit each repo's changes separately, with its own commit messages.

---

### Task 1: Python — shared server-secret helper

**Files:**
- Create: `backend/maroon_masters/server_secret.py`
- Test: `backend/tests/test_server_secret.py`

**Interfaces:**
- Produces (consumed by Tasks 2 and 3): `check_server_secret(secret: str) -> bool` — reads `PYTHON_API_SECRET` from the environment (via the same local-`.env.local`-loading behavior `host_auth.py`/`player_auth.py` already have) and does a constant-time comparison. Returns `False` (never raises) if the env var isn't set or doesn't match.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_server_secret.py
from maroon_masters import server_secret


def test_check_server_secret_succeeds_with_matching_env(monkeypatch):
    monkeypatch.setenv("PYTHON_API_SECRET", "test-secret-value")

    assert server_secret.check_server_secret("test-secret-value") is True
    assert server_secret.check_server_secret("wrong") is False


def test_check_server_secret_fails_when_env_not_configured(monkeypatch):
    monkeypatch.delenv("PYTHON_API_SECRET", raising=False)

    assert server_secret.check_server_secret("anything") is False


def test_check_server_secret_handles_none_and_empty(monkeypatch):
    monkeypatch.setenv("PYTHON_API_SECRET", "test-secret-value")

    assert server_secret.check_server_secret("") is False
    assert server_secret.check_server_secret(None) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `python -m pytest tests/test_server_secret.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'maroon_masters.server_secret'`

- [ ] **Step 3: Write the implementation**

```python
# backend/maroon_masters/server_secret.py
"""Shared-secret auth for the Python API, mirroring appscript/write-scores.gs's
checkServerSecret: the caller (MM-Website's own server) has already verified who's
asking via its own Supabase login before it ever calls here, so this only needs to
confirm the caller is really MM-Website's server — not re-derive identity."""

from __future__ import annotations

import hmac
import os
from pathlib import Path

_ENV_LOADED = False


def _load_local_env() -> None:
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    _ENV_LOADED = True
    env_path = Path(__file__).resolve().parents[2] / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        clean_key = key.strip()
        if not os.environ.get(clean_key):
            os.environ[clean_key] = value.strip()


def check_server_secret(secret: str | None) -> bool:
    _load_local_env()
    expected = os.environ.get("PYTHON_API_SECRET", "")
    if not expected or not secret:
        return False
    return hmac.compare_digest(str(secret), expected)
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `backend/`): `python -m pytest tests/test_server_secret.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
cd backend/..  # repo root
git add backend/maroon_masters/server_secret.py backend/tests/test_server_secret.py
git commit -m "feat: add shared server-secret auth, replacing per-user login tokens"
```

---

### Task 2: Python — swap host auth to the shared secret

**Files:**
- Modify: `backend/maroon_masters/service.py` (`_require_host`, `host_delete_player`, `admin_action`, `copy_to_rehearsal`, delete `host_login`)
- Modify: `backend/maroon_masters/api.py` (delete `/host-login` route + `HostLoginRequest`)
- Modify: `backend/maroon_masters/host_auth.py` (delete login/token code, keep only `_load_local_env` if still needed — it isn't, delete the whole file)
- Modify: `backend/tests/test_host_auth.py` → delete (superseded by `test_server_secret.py`)
- Modify: any test in `backend/tests/*` that calls `host_auth.make_host_token`/`verify_host_token`/`check_login` to instead pass the literal secret string

**Interfaces:**
- Consumes: `server_secret.check_server_secret` from Task 1.
- Produces (consumed by Task 4's TS client and all later phases): every host-facing `ScorekeeperService` method keeps its existing signature (still takes `token: str` as its first argument — no renames, so the change is minimal) but now treats that value as the shared secret, not a per-user token. `_require_host(token: str) -> str | None` returns `"Not authorized."` on mismatch instead of `"Please log in again."`.

- [ ] **Step 1: Update `_require_host`**

In `backend/maroon_masters/service.py`, change the import and the helper:

```python
# was: from . import host_auth, player_auth
from . import player_auth, server_secret
```

```python
# was:
#     def _require_host(self, token: str) -> str | None:
#         if not host_auth.verify_host_token(token):
#             return "Please log in again."
#         return None
def _require_host(self, token: str) -> str | None:
    if not server_secret.check_server_secret(token):
        return "Not authorized."
    return None
```

- [ ] **Step 2: Collapse the destructive-action second factors onto the same secret**

`host_delete_player` and `admin_action`'s `reset_live` path currently demand a
re-entered host username/password on top of the token; `admin_action`'s other
destructive branches and `copy_to_rehearsal` check a hardcoded `CADE_MASTER_CODE`
pin instead. Both are leftover, weaker, parallel auth systems now that there's no
more separate host login to re-enter credentials for — `_require_host` (backed by
the one real secret) is already the full security boundary, matching why the
Sheet's equivalent `CADE_MASTER_CODE` backdoor was removed on 2026-08-14. Drop
both secondary checks:

```python
# host_delete_player — was:
#     def host_delete_player(self, token: str, player_first: str, username: str = "", password: str = "") -> dict:
#         error = self._require_host(token)
#         if error:
#             return {"ok": False, "error": error}
#         if player_first not in self.tournament.players:
#             return {"ok": False, "error": "Player not found."}
#         if not host_auth.check_login(username, password):
#             return {"ok": False, "error": "Host username/password are required to delete a player."}
def host_delete_player(self, token: str, player_first: str) -> dict:
    error = self._require_host(token)
    if error:
        return {"ok": False, "error": error}
    if player_first not in self.tournament.players:
        return {"ok": False, "error": "Player not found."}
```

Remove the now-unused `username`/`password` parameters from every call site of
`host_delete_player` (just this one method's signature changed).

In `admin_action`, remove the `if not host_auth.check_login(username, password):`
block from the `reset_live` branch (keep the rest of that branch's body — the
actual reset logic — unchanged), and remove the `username: str = "", password: str
= ""` parameters from `admin_action`'s signature. In both `admin_action` and
`copy_to_rehearsal`, remove the `if str(pin or "").strip().upper() != CADE_MASTER_CODE:`
check and the `pin: str` parameter — `_require_host(token)` above it is already
sufficient. Search `backend/maroon_masters/service.py` for `CADE_MASTER_CODE` to
find its definition and remove that constant too once nothing references it.

- [ ] **Step 3: Delete `host_login` and its route**

Remove the `host_login` method from `service.py` entirely (it's dead — nothing
calls it once MM-Scorekeeper's own frontend is retired).

In `backend/maroon_masters/api.py`, delete the `HostLoginRequest` model and the
`/host-login` route:

```python
# delete this whole block:
# class HostLoginRequest(BaseModel):
#     username: str
#     password: str
#
# @app.post("/host-login")
# def host_login(body: HostLoginRequest, request: Request) -> dict:
#     return service_for(request).host_login(body.username, body.password)
```

Update the two other Pydantic models that had fields purely for the deleted
second-factor checks:

```python
# was:
# class HostDeletePlayerRequest(BaseModel):
#     token: str
#     playerFirst: str
#     username: str = ""
#     password: str = ""
class HostDeletePlayerRequest(BaseModel):
    token: str
    playerFirst: str
```

```python
# was:
# class HostAdminActionRequest(BaseModel):
#     token: str
#     pin: str = ""
#     username: str = ""
#     password: str = ""
#     action: Literal[...]
#     year: int = Field(default=2027, ge=2024)
#     day: int | None = Field(default=None, ge=1, le=4)
#     session: str | None = None
#     round: int | None = Field(default=None, ge=1, le=8)
class HostAdminActionRequest(BaseModel):
    token: str
    action: Literal["reset_rehearsal", "copy_live_to_rehearsal", "clear_session", "clear_round_scores", "reset_live"]
    year: int = Field(default=2027, ge=2024)
    day: int | None = Field(default=None, ge=1, le=4)
    session: str | None = None
    round: int | None = Field(default=None, ge=1, le=8)
```

And their route bodies:

```python
# was:
# @app.post("/host-delete-player")
# def host_delete_player(body: HostDeletePlayerRequest, request: Request) -> dict:
#     return service_for(request).host_delete_player(body.token, body.playerFirst, body.username, body.password)
@app.post("/host-delete-player")
def host_delete_player(body: HostDeletePlayerRequest, request: Request) -> dict:
    return service_for(request).host_delete_player(body.token, body.playerFirst)
```

```python
# was:
# @app.post("/host-admin-action")
# def host_admin_action(body: HostAdminActionRequest, request: Request) -> dict:
#     live_service = service_for(request, "live")
#     rehearsal_service = service_for(request, "rehearsal")
#     if body.action == "copy_live_to_rehearsal":
#         return live_service.copy_to_rehearsal(body.token, body.pin, rehearsal_service)
#     return service_for(request).admin_action(body.token, body.pin, body.action, body.year, body.day, body.session, body.round, body.username, body.password)
@app.post("/host-admin-action")
def host_admin_action(body: HostAdminActionRequest, request: Request) -> dict:
    live_service = service_for(request, "live")
    rehearsal_service = service_for(request, "rehearsal")
    if body.action == "copy_live_to_rehearsal":
        return live_service.copy_to_rehearsal(body.token, rehearsal_service)
    return service_for(request).admin_action(body.token, body.action, body.year, body.day, body.session, body.round)
```

`copy_to_rehearsal`'s signature also loses its `pin` parameter — change it the
same way as `admin_action` in Step 2 (drop the `CADE_MASTER_CODE` check and the
`pin: str` parameter).

- [ ] **Step 4: Delete `host_auth.py` and its test**

```bash
git rm backend/maroon_masters/host_auth.py backend/tests/test_host_auth.py
```

- [ ] **Step 5: Fix up remaining test references**

Run: `cd backend && python -m pytest -v 2>&1 | grep -i "error\|host_auth"`

Any test that imports `host_auth` or calls `host_auth.make_host_token(...)` to
build a token for a test request needs updating to instead call
`monkeypatch.setenv("PYTHON_API_SECRET", "test-secret")` and pass `"test-secret"`
directly as the `token` field in the request body (see `test_api.py`'s `client()`
helper for the pattern already used there).

- [ ] **Step 6: Run the full backend test suite**

Run: `cd backend && python -m pytest -v`
Expected: all tests pass, zero references to `host_auth` remain (`grep -rn
"host_auth" backend/` returns nothing).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: swap host auth to the shared server secret, drop legacy login/PIN checks"
```

---

### Task 3: Python — swap player auth to the shared secret + explicit identity

**Files:**
- Modify: `backend/maroon_masters/service.py` (`account_whoami`, `account_update_settings`, `account_submit_profile_edit`, `account_update_contact`, `account_my_matches`, `account_my_scorecard`, `account_submit_non_tournament_round`, `_account_or_error`, delete `account_signup`/`account_login`)
- Modify: `backend/maroon_masters/api.py` (rename `sessionToken: str` → `secret: str` and add `player: str` on the 7 `Account*Request` models; delete `AccountSignupRequest`/`AccountLoginRequest` and their routes; delete `/validate-code`, `/submit-hole-as`, `/cade-master-player-round`, `/cade-master-submit-hole`, `/legacy`, `/live-feed` and their models)
- Modify: `backend/maroon_masters/player_auth.py` (delete signup/login/token code, keep only password-hash-free — actually delete the whole file, nothing in it survives)
- Modify: `backend/maroon_masters/storage.py` (`SQLiteStore` and `PostgresStateStore`: add `get_or_create_account_by_player`)
- Modify: `backend/tests/test_player_auth.py` → delete
- Modify: `backend/tests/test_api.py`, `backend/tests/test_account_service.py`, `backend/tests/test_storage.py` — update to the new signatures

**Interfaces:**
- Consumes: `server_secret.check_server_secret` from Task 1.
- Produces (consumed by Task 5 and every later phase): every `account_*` method's
  signature becomes `(self, secret: str, player_first: str, ...)` — no more
  `session_token`, no more rotating tokens in responses. `_account_or_error`
  becomes `_account_or_error(self, player_first: str) -> tuple[PlayerAccount, str
  | None]` and never returns "Account not found" — it lazily creates the row.

- [ ] **Step 1: Add lazy account provisioning to storage**

In `backend/maroon_masters/storage.py`, add to `SQLiteStore` (near
`get_account_by_player`):

```python
def get_or_create_account_by_player(self, player_first: str) -> PlayerAccount:
    existing = self.get_account_by_player(player_first)
    if existing:
        return existing
    with self.connect() as conn:
        conn.execute(
            "INSERT INTO player_accounts (player_first) VALUES (?)",
            (player_first,),
        )
    return self.get_account_by_player(player_first)  # type: ignore[return-value]
```

And the Postgres equivalent on `PostgresStateStore`:

```python
def get_or_create_account_by_player(self, player_first: str) -> PlayerAccount:
    existing = self.get_account_by_player(player_first)
    if existing:
        return existing
    with self.connect() as conn:
        conn.execute(
            "INSERT INTO player_accounts (player_first) VALUES (%s) ON CONFLICT (player_first) DO NOTHING",
            (player_first,),
        )
    return self.get_account_by_player(player_first)  # type: ignore[return-value]
```

- [ ] **Step 2: Write the failing tests for the new storage method**

Add to `backend/tests/test_storage.py` (matching that file's existing
`SQLiteStore`-in-a-tmp-path pattern — read the top of the file for its fixture
before writing this):

```python
def test_get_or_create_account_by_player_creates_when_missing(store):
    account = store.get_or_create_account_by_player("Cade")

    assert account.player_first == "Cade"
    assert account.username == ""


def test_get_or_create_account_by_player_returns_existing(store):
    first = store.get_or_create_account_by_player("Cade")
    second = store.get_or_create_account_by_player("Cade")

    assert first.id == second.id
```

- [ ] **Step 3: Run to verify they fail, then pass**

Run: `cd backend && python -m pytest tests/test_storage.py -v -k get_or_create`
Expected first: FAIL (`AttributeError: 'SQLiteStore' object has no attribute
'get_or_create_account_by_player'`). After Step 1's code is in place: PASS.

- [ ] **Step 4: Swap `_account_or_error` and all 7 player methods**

In `service.py`:

```python
# was:
#     def _account_or_error(self, player_first: str) -> tuple[PlayerAccount | None, str | None]:
#         if not self.store:
#             return None, "Storage is not configured."
#         account = self.store.get_account_by_player(player_first)
#         if not account:
#             return None, "Account not found."
#         return account, None
def _account_or_error(self, player_first: str) -> tuple[PlayerAccount | None, str | None]:
    if not self.store:
        return None, "Storage is not configured."
    return self.store.get_or_create_account_by_player(player_first), None
```

Then, for each of the 7 methods, replace the token-decode line with a secret
check plus the now-explicit `player_first` parameter. Example for
`account_whoami` (apply the identical shape to the other 6):

```python
# was:
#     def account_whoami(self, session_token: str) -> dict:
#         player_first = player_auth.verify_player_token(session_token)
#         if not player_first:
#             return {"ok": False, "error": "Session expired. Please log in again."}
def account_whoami(self, secret: str, player_first: str) -> dict:
    if not server_secret.check_server_secret(secret):
        return {"ok": False, "error": "Not authorized."}
```

Also delete the rotating-token minting from `account_whoami`'s and
`account_update_settings`'s return dicts — drop the `"sessionToken": new_token,
"expiresAt": expires_at_ms` keys and the `player_auth.make_player_token(...)` call
above them; there's no more session to rotate.

Apply the same two changes (secret check replacing token decode; `player_first`
now a real parameter instead of derived) to `account_update_settings`,
`account_submit_profile_edit`, `account_update_contact`, `account_my_matches`,
`account_my_scorecard`, and `account_submit_non_tournament_round`. Each keeps its
other parameters exactly as they were.

- [ ] **Step 5: Delete `account_signup`/`account_login` and `player_auth.py`**

Remove both methods from `service.py` (dead — no more local password
signup/login), then:

```bash
git rm backend/maroon_masters/player_auth.py backend/tests/test_player_auth.py
```

- [ ] **Step 6: Update `api.py`'s Pydantic models and routes**

For each of the 7 `Account*Request` models, rename `sessionToken: str` to `secret:
str` and add `player: str`, e.g.:

```python
# was:
# class AccountWhoamiRequest(BaseModel):
#     sessionToken: str
class AccountWhoamiRequest(BaseModel):
    secret: str
    player: str
```

Update each route body to pass both through, e.g.:

```python
# was:
# @app.post("/player-whoami")
# def player_whoami(body: AccountWhoamiRequest, request: Request) -> dict:
#     return service_for(request).account_whoami(body.sessionToken)
@app.post("/player-whoami")
def player_whoami(body: AccountWhoamiRequest, request: Request) -> dict:
    return service_for(request).account_whoami(body.secret, body.player)
```

Delete `AccountSignupRequest`, `AccountLoginRequest`, `ValidateCodeRequest`,
`SubmitHoleAsRequest`, `CadeMasterPlayerRoundRequest`, `CadeMasterSubmitHoleRequest`,
`LegacyRequest` and their routes (`/player-signup`, `/player-login`,
`/validate-code`, `/submit-hole-as`, `/cade-master-player-round`,
`/cade-master-submit-hole`, `/legacy`, `/live-feed`) — all dead once
MM-Scorekeeper's own frontend and code-based player auth are retired.

- [ ] **Step 7: Fix up remaining tests**

Run: `cd backend && python -m pytest -v 2>&1 | grep -iE "error|player_auth|session"`

Update every failing test in `test_api.py` and `test_account_service.py` to pass
`{"secret": "test-secret", "player": "Cade", ...}` instead of a
`sessionToken`/minted token, with `monkeypatch.setenv("PYTHON_API_SECRET",
"test-secret")` set up first.

- [ ] **Step 8: Run the full backend test suite**

Run: `cd backend && python -m pytest -v`
Expected: all tests pass, `grep -rn "player_auth\|sessionToken" backend/` returns
nothing outside of comments/docs.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: swap player auth to the shared server secret + explicit identity"
```

---

### Task 4: MM-Website — Python API client + host session guard

**Files:**
- Create: `lib/scorekeeper/pythonClient.ts`
- Create: `lib/portal/requireHost.ts`
- Modify: `.env.example` (add `PYTHON_API_URL`, `PYTHON_API_SECRET`)
- Test: `lib/scorekeeper/pythonClient.test.mts`
- Test: `lib/portal/requireHost.test.mts`

**Interfaces:**
- Produces (consumed by Task 5 and every later phase): `callPythonApi<T>(path:
  string, body: Record<string, unknown>): Promise<T>` — POSTs to `${PYTHON_API_URL}${path}`
  with `secret: process.env.PYTHON_API_SECRET` merged into the body, throws on
  network failure or non-2xx (callers wrap it, matching `lib/scorekeeper/client.ts`'s
  `safeCall` pattern). `requireHost(): Promise<{ userId: string } | null>` —
  mirrors `requirePlayer()` but checks `profiles.is_host` instead of `player_slug`.

- [ ] **Step 1: Write the failing test for `requireHost`**

```typescript
// lib/portal/requireHost.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { requireHost } from "./requireHost.ts";

test("requireHost returns null when there's no session", async () => {
  // requirePlayer.ts has no existing test file to pattern-match — this repo's
  // Supabase server client isn't mockable without a running project, so this
  // suite only covers the parts that don't need a live Supabase call: import
  // shape and that the function is exported and async.
  assert.equal(typeof requireHost, "function");
});
```

(This is intentionally a thin smoke test — `requirePlayer.ts` has no existing
automated test either, for the same reason: it's a thin Supabase-session wrapper
that's exercised by the Route Handlers that use it, covered in Task 5's
integration test instead.)

- [ ] **Step 2: Write `requireHost.ts`**

```typescript
// lib/portal/requireHost.ts
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface HostSession {
  userId: string;
}

/**
 * Server-side guard for host-only (Tiger) actions. Returns null if there's no
 * session or the account isn't flagged is_host — callers should treat null as
 * "respond 401", never trust a client-supplied "I'm the host" claim.
 */
export async function requireHost(): Promise<HostSession | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) return null;

  return { userId: user.id };
}
```

- [ ] **Step 3: Write the failing test for `pythonClient`**

```typescript
// lib/scorekeeper/pythonClient.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { callPythonApi } from "./pythonClient.ts";

test("callPythonApi posts to PYTHON_API_URL + path with the secret merged in", async () => {
  process.env.PYTHON_API_URL = "https://example.test";
  process.env.PYTHON_API_SECRET = "test-secret";
  let capturedUrl = "";
  let capturedBody: unknown;
  (globalThis as { fetch: typeof fetch }).fetch = (async (url: string, init: RequestInit) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init.body as string);
    return new Response(JSON.stringify({ ok: true, value: 42 }), { status: 200 });
  }) as typeof fetch;

  const result = await callPythonApi<{ ok: boolean; value: number }>("/player-whoami", { player: "Cade" });

  assert.equal(capturedUrl, "https://example.test/player-whoami");
  assert.deepEqual(capturedBody, { player: "Cade", secret: "test-secret" });
  assert.deepEqual(result, { ok: true, value: 42 });
});

test("callPythonApi throws when PYTHON_API_URL is not configured", async () => {
  delete process.env.PYTHON_API_URL;
  process.env.PYTHON_API_SECRET = "test-secret";

  await assert.rejects(() => callPythonApi("/player-whoami", { player: "Cade" }), /not configured/);
});

test("callPythonApi throws on a non-2xx response", async () => {
  process.env.PYTHON_API_URL = "https://example.test";
  process.env.PYTHON_API_SECRET = "test-secret";
  (globalThis as { fetch: typeof fetch }).fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;

  await assert.rejects(() => callPythonApi("/player-whoami", { player: "Cade" }), /500/);
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- lib/scorekeeper/pythonClient.test.mts lib/portal/requireHost.test.mts`
Expected: FAIL (`Cannot find module './pythonClient.ts'` / `'./requireHost.ts'`)

- [ ] **Step 5: Write `pythonClient.ts`**

```typescript
// lib/scorekeeper/pythonClient.ts
/**
 * The one place MM-Website talks to MM-Scorekeeper's Python backend
 * (maroon-masters-python-api). Every call carries PYTHON_API_SECRET, the same
 * shared-secret trust model appscript/write-scores.gs uses for the Sheet — the
 * caller has already verified identity via Supabase before this is ever called.
 */
export async function callPythonApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const baseUrl = process.env.PYTHON_API_URL;
  const secret = process.env.PYTHON_API_SECRET;
  if (!baseUrl) throw new Error("PYTHON_API_URL is not configured.");
  if (!secret) throw new Error("PYTHON_API_SECRET is not configured.");

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, secret }),
  });
  if (!res.ok) throw new Error(`Python API responded with ${res.status}`);
  return (await res.json()) as T;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- lib/scorekeeper/pythonClient.test.mts lib/portal/requireHost.test.mts`
Expected: all pass

- [ ] **Step 7: Add the env var placeholders**

In `.env.example`, add under the existing scoring-secret comment block:

```
# Shared secret with MM-Scorekeeper's Python backend (maroon-masters-python-api) — see docs/superpowers/plans/2026-08-27-scorekeeper-portal-merge-phase1-foundation.md
PYTHON_API_URL=
PYTHON_API_SECRET=
```

- [ ] **Step 8: Run the full check and commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

```bash
git add lib/scorekeeper/pythonClient.ts lib/scorekeeper/pythonClient.test.mts lib/portal/requireHost.ts lib/portal/requireHost.test.mts .env.example
git commit -m "feat: add the Python API client and host session guard"
```

---

### Task 5: MM-Website — prove the pipeline end-to-end with a real profile read

**Files:**
- Create: `app/api/portal/profile/route.ts`
- Test: `app/api/portal/profile/route.test.mts`

**Interfaces:**
- Consumes: `requirePlayer` (existing), `callPythonApi` (Task 4).
- Produces (consumed by Phase 2's profile-editing UI): `GET
  /api/portal/profile` → `{ ok: true, playerFirst, displayName, team, email,
  phone, logoutAfterMinutes, pendingEdits, profile } | { ok: false, error }` —
  the same shape `account_whoami` already returns, since this route is a thin,
  authenticated pass-through to it.

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/portal/profile/route.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";

// requirePlayer.ts calls createSupabaseServerClient(), which needs real env
// vars to construct — this route is exercised for real via the manual
// walkthrough in Step 4 below. This automated test covers the one pure piece:
// that an unauthenticated request is rejected before any Python call happens.
test("GET /api/portal/profile rejects when requirePlayer resolves null", async () => {
  const { GET } = await import("./route.ts");
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  (globalThis as { fetch: typeof fetch }).fetch = (async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const res = await GET();

  assert.equal(res.status, 401);
  assert.equal(fetchCalled, false, "must not call the Python API without a resolved player");
  globalThis.fetch = originalFetch;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/api/portal/profile/route.test.mts`
Expected: FAIL (`Cannot find module './route.ts'`), since there's no Supabase
session in the test environment, `requirePlayer()` will resolve `null` anyway —
confirm that's what makes it pass once the route exists, not a false positive.

- [ ] **Step 3: Write `app/api/portal/profile/route.ts`**

```typescript
// app/api/portal/profile/route.ts
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { callPythonApi } from "@/lib/scorekeeper/pythonClient";

interface WhoamiResponse {
  ok: boolean;
  error?: string;
  playerFirst?: string;
  displayName?: string;
  team?: string | null;
  email?: string;
  phone?: string;
  logoutAfterMinutes?: number;
  pendingEdits?: { id: number; submittedFields: Record<string, string> }[];
  profile?: Record<string, string>;
}

export async function GET() {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  try {
    const result = await callPythonApi<WhoamiResponse>("/player-whoami", { player: player.playerFullName });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not reach the scoring system." }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app/api/portal/profile/route.test.mts`
Expected: PASS

- [ ] **Step 5: Manual end-to-end walkthrough**

This is the real proof the bridge works — no automated test can exercise a live
Supabase session against a live Python deployment.

1. In MM-Scorekeeper's Vercel project (`maroon-masters-python-api`), set
   `PYTHON_API_SECRET` to a long random value (Vercel dashboard → Settings →
   Environment Variables). Redeploy.
2. In MM-Website's local `.env` and Vercel project settings, set
   `PYTHON_API_URL` to `https://maroon-masters-python-api.vercel.app` and
   `PYTHON_API_SECRET` to the exact same value from Step 1.
3. Run `npm run dev`, log in as a real player account, open
   `/api/portal/profile` directly in the browser (or `curl` it with the
   session cookie).
4. Expect `{ "ok": true, "playerFirst": "...", ... }` with that player's real
   data from Postgres — confirms Supabase → MM-Website → Python secret →
   Postgres works end to end.
5. Change `PYTHON_API_SECRET` in just one of the two places and repeat — expect
   `{ "ok": false, "error": "Not authorized." }`, confirming the secret check
   actually rejects a mismatch (don't leave the mismatch in place — restore the
   matching value afterward).

- [ ] **Step 6: Run the full check and commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

```bash
git add app/api/portal/profile/route.ts app/api/portal/profile/route.test.mts
git commit -m "feat: add /api/portal/profile, the first real Python-backed portal route"
```

---

## Definition of done for this phase

- Every Python endpoint that used to require a host/player login token now
  requires `PYTHON_API_SECRET` instead; `host_auth.py` and `player_auth.py` no
  longer exist; `grep -rn "verify_host_token\|verify_player_token\|check_login\|CADE_MASTER_CODE"
  backend/` (from the MM-Scorekeeper repo root) returns nothing.
- MM-Website has a working, tested `callPythonApi` client and `requireHost`
  guard, and one real route (`/api/portal/profile`) proven end-to-end against
  the live Python deployment per Task 5's manual walkthrough.
- Both repos' full check suites pass (`npm test && npx tsc --noEmit && npm run
  lint && npm run build` in MM-Website; `python -m pytest` in MM-Scorekeeper's
  `backend/`).
- Nothing in this phase changed the public `/leaderboard`, the Sheet, or any
  MM-Scorekeeper business logic/data.
