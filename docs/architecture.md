# Architecture

## Design goals

- **Free to run.** Supabase free tier, Strava API, Gemini free tier, Telegram Bot
  API, Vercel Hobby. No paid service is required.
- **Secrets stay server-side.** Provider tokens and API keys never reach the
  browser. Every module holding a secret imports `server-only`.
- **Own your data.** RLS isolates rows per user, even though there is one user
  today.
- **Honest metrics.** Anything this app calculates is labelled as calculated.
  Strava-native and app-derived values are never mixed.
- **Consent before change.** The coach proposes plan changes; it does not apply
  them silently.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Web | Next.js 14 App Router, TypeScript, Tailwind | One deployable for UI + API |
| DB / Auth | Supabase (Postgres + RLS) | Free tier, hosted auth, no local DB |
| Activity data | Strava API | Self-service OAuth; Garmin watches sync into it |
| AI | Google Gemini REST | Free tier is enough for one athlete |
| Messaging | Telegram Bot API | Free, no approval, no 24-hour reply window |
| Hosting | Vercel | Free HTTPS origin for OAuth + webhooks |

### Rejected alternatives

- **Garmin Connect API** — approval-only, aimed at corporate wellness partners,
  and the interesting metrics (Body Battery, HRV, Training Load) are not exposed.
  Garmin devices are read through Strava instead.
- **WhatsApp Cloud API** — needs a Meta Business account, the test number only
  reaches 5 allow-listed contacts, and proactive messages outside the 24-hour
  window require Meta-approved templates. Telegram has none of those limits.
- **OpenAI** — no free tier.

## Data flow

```
Garmin / phone / head unit
          ↓
       Strava
          ↓  OAuth + webhook or manual sync
  lib/strava/{client,tokens,sync}
          ↓  normalize
  lib/strava/mapper  →  lib/training/load     (per-activity TSS)
          ↓
     activities table
          ↓
  lib/training/rollup                          (CTL / ATL / TSB series)
          ↓
   training_load table
          ↓
  lib/coach/context                            (compact text snapshot)
          ↓
  lib/ai/gemini                                (system prompt + history)
          ↓
  coach_messages  →  web chat / Telegram
```

## Modules

| Path | Responsibility |
| --- | --- |
| `lib/supabase/` | Four clients: browser, request-scoped server, service-role, middleware session refresh |
| `lib/env.ts` | zod-validated env. Required vars throw; optional integrations return `null` so features degrade instead of crashing |
| `lib/crypto.ts` | AES-256-GCM encrypt/decrypt for stored tokens, plus constant-time compare for webhook secrets |
| `lib/strava/` | OAuth, token refresh with a 5-minute margin, paged incremental sync, payload validation |
| `lib/training/load.ts` | Pure functions. Power-based TSS; heart-rate-reserve fallback |
| `lib/training/rollup.ts` | Daily bucketing in the athlete's timezone, exponentially-weighted fitness/fatigue/form |
| `lib/training/power-curve.ts` | Pure mean-maximal power over a watts stream, via prefix sums |
| `lib/training/ftp.ts` | 90-day FTP estimate from the stored curves |
| `lib/training/planner.ts` | Pure weekly plan builder constrained by availability, CTL, TSB and block position |
| `lib/training/plan-service.ts` | Loads state, calls the planner, asks Gemini for a narrative, commits on approval |
| `lib/training/reconcile.ts` | Marks past sessions completed or skipped by matching rides to dates |
| `lib/coach/` | System prompt (the coaching rules), athlete context builder, conversation persistence, daily nudge |
| `lib/telegram/` | Bot API client |

### Why no per-second samples

The original schema had an `activity_samples` table. It was dropped in migration
002. Storing every second of every ride costs roughly 7000 rows per two-hour
ride and makes every FTP calculation a table scan, against a 500 MB free-tier
quota. A mean-maximal power curve answers the same questions — FTP, best efforts,
power curve chart — in about six numbers per ride. Ride-by-ride replay is the
only thing lost, and Strava already does that well.

## Security

- **RLS everywhere.** Every policy declares both `using` and `with check`, so a
  user cannot insert or update a row pointing at somebody else's `user_id`.
- **`strava_connections` is select/delete only** from the browser. Tokens are
  written exclusively by the service role, so the client can never mint or
  overwrite credentials.
- **Tokens encrypted at rest** with AES-256-GCM using `TOKEN_ENCRYPTION_KEY`.
  A leaked database dump does not leak Strava access.
- **OAuth CSRF** via a random `state` in an httpOnly cookie, compared in
  constant time. Granted scopes are verified, since Strava lets users untick them.
- **Webhook authentication.** Strava's `verify_token` and Telegram's
  `X-Telegram-Bot-Api-Secret-Token` are both compared in constant time, as is the
  cron job's `Authorization: Bearer` token.
- **Open-redirect guarded.** `next` parameters are only honoured when they are
  same-site relative paths.
- **Error bodies are never forwarded** from Gemini or Strava token endpoints,
  because they can echo back the API key or client secret.
- **`handle_new_user()`** is `security definer` with a pinned `search_path` and
  `execute` revoked from `public`, `anon` and `authenticated`.
- **Middleware never touches `api/` or `auth/`**, so webhooks and OAuth
  callbacks are not redirected to the login page.

## Coaching guardrails

Encoded in the system prompt in `lib/coach/index.ts`:

1. Only use data present in the context; ask instead of guessing.
2. Declare derived metrics as derived.
3. No medical diagnosis; escalate symptoms to a professional.
4. Respect declared availability windows and per-day duration caps.
5. Ask for explicit confirmation before changing an existing plan.

## Not built yet

- Ride-by-ride stream replay (deliberately traded away, see above).
- Race / event targets driving a taper.
- Sharing or coaching a second athlete.
