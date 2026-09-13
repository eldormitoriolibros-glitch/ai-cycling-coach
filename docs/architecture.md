# Architecture

## Design goals

- **Free to run.** Supabase free tier, Gemini free tier, Telegram Bot API,
  Vercel Hobby. No paid service is required.
- **Secrets stay server-side.** Provider credentials and API keys never reach
  the browser. Every module holding a secret imports `server-only`.
- **Own your data.** RLS isolates rows per user.
- **Honest metrics.** Anything this app calculates is labelled as calculated.
  Vendor-native and app-derived values are never mixed.
- **Consent before change.** The coach proposes plan changes; it does not apply
  them silently.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Web | Next.js 14 App Router, TypeScript, Tailwind | One deployable for UI + API |
| DB / Auth | Supabase (Postgres + RLS) | Free tier, hosted auth, no local DB |
| Activity data | Garmin Connect, via the athlete's own login | Full FIT files: laps, temperature, respiration |
| Activity data (backup) | Strava API, optional | Covers athletes without a Garmin |
| AI | Google Gemini REST | Free tier is enough for a handful of athletes |
| Messaging | Telegram Bot API | Free, no approval, no 24-hour reply window |
| Hosting | Vercel | Free HTTPS origin for OAuth + webhooks |

### Rejected alternatives

- **Garmin Connect developer API** — approval-only, aimed at corporate wellness
  partners, and the interesting metrics (Body Battery, HRV, Training Load) are
  not exposed. The app signs in as the athlete instead and reads FIT files.
- **WhatsApp Cloud API** — needs a Meta Business account, the test number only
  reaches 5 allow-listed contacts, and proactive messages outside the 24-hour
  window require Meta-approved templates. Telegram has none of those limits.
- **OpenAI** — no free tier.

## Data flow

```
Garmin head unit / watch
          ↓
   Garmin Connect  ──────────────┐          (optional) Strava
          ↓  login + FIT download │                  ↓  OAuth + webhook
  lib/garmin/{client,sync-service,fit,laps-store}    lib/strava/{client,sync}
          ↓  normalize                               ↓
          └──────────→  lib/training/load  ←─────────┘   (per-activity TSS)
                              ↓
                       activities table
                              ↓
                    lib/training/rollup                 (CTL / ATL / TSB)
                              ↓
                     training_load table
                              ↓
                    lib/coach/context                   (compact snapshot)
                              ↓
            lib/coach/system-prompt  ←  lib/coach/doctrine
                              ↓
                      lib/ai/gemini
                              ↓
              coach_messages  →  web chat / Telegram
```

## Modules

| Path | Responsibility |
| --- | --- |
| `lib/supabase/` | Four clients: browser, request-scoped server, service-role, middleware session refresh |
| `lib/env.ts` | zod-validated env. Required vars throw; optional integrations (Gemini, Telegram, cron, Strava, invite code) return `null` so features degrade instead of crashing |
| `lib/crypto.ts` | AES-256-GCM encrypt/decrypt for stored credentials, plus constant-time compare for webhook and cron secrets |
| `lib/rate-limit.ts` | In-memory fixed-window limiter for the coach and the auth endpoints |
| `lib/garmin/` | Connect login, incremental sync, FIT parsing, lap extraction, archive import, backfill, duplicate removal |
| `lib/strava/` | Optional second source: OAuth, token refresh, paged incremental sync |
| `lib/training/load.ts` | Pure functions. Power-based TSS; heart-rate-reserve and duration fallbacks |
| `lib/training/rollup.ts` | Daily bucketing in the athlete's timezone, exponentially-weighted fitness/fatigue/form |
| `lib/training/power-curve.ts` | Pure mean-maximal power over a watts stream, via prefix sums |
| `lib/training/ftp.ts` | 90-day FTP estimate from the stored curves |
| `lib/training/planner2.ts` | Pure weekly plan builder constrained by availability, CTL, TSB and block position |
| `lib/training/plan-service.ts` | Loads state, calls the planner, asks Gemini for a narrative, commits on approval |
| `lib/training/plan-replace.ts` | Decides which scheduled sessions a plan change replaces: same date *and* same kind, so a shorter ride does not delete that day's strength work |
| `lib/training/reconcile.ts` | Marks past sessions completed or skipped by matching rides to dates |
| `lib/coach/` | Rules, doctrine, athlete context, conversation persistence, plan confirmation, session reviews |
| `lib/telegram/` | Bot API client |

## The coach

### Prompt layers

`lib/coach/system-prompt.ts` composes, in this fixed order:

1. **`RULES`** (`lib/coach/index.ts`) — the app contract: the hidden ```plan```
   JSON block, confirmation before writing, never invent data, no medical
   advice, respect the availability ceiling, warmup and cooldown inside the
   total. If doctrine and rules disagree, rules win.
2. **`COACH_DOCTRINE`** (`lib/coach/doctrine.ts`) — the training criteria:
   intensity distribution by weekly ceiling, 3+1 blocks, session design per
   zone, strength, reading an athlete with a bike computer and no watch.
3. A plain-text note when the channel is Telegram.
4. **`# Contexto del atleta`** (`lib/coach/context.ts`).

Session reviews use `COACH_DOCTRINE_REVIEW` plus `REVIEW_RULES`, which caps the
answer at 12 lines.

### Writing a plan

```
coach proposes  →  reply carries a ```plan``` JSON block (hidden from the athlete)
athlete confirms →  isPlanConfirm() on Telegram, or the button on the web
                 →  pickLastProposedPlan() finds the proposal, skipping reviews
                 →  coachPlanToDraft() normalises dates, zones, targets
                 →  commitWeeklyPlan() replaces only matching date + kind
```

### Reviewing a session

`lib/coach/session-compare.ts` produces the verdict deterministically from the
prescription and the ride: duration ratio, power or heart rate against target,
and lap counting when the title encodes intervals like `3x10`. Strength
sessions are never scored against a ride from the same day. The model is handed
that verdict and told to copy it. A review is sent only when the athlete marks
the session done or asks for it (`/devolucion`, "dame la devolución"); the
daily cron never pushes one.

### Why no per-second samples for FTP

The original schema stored every second of every ride: roughly 7000 rows per
two-hour ride, against a 500 MB free-tier quota, and every FTP calculation
became a table scan. A mean-maximal power curve answers the same questions —
FTP, best efforts, power curve chart — in about six numbers per ride. Samples
are still kept for recent rides so the activity charts work.

## Security

- **RLS everywhere.** Every policy declares both `using` and `with check`, so a
  user cannot insert or update a row pointing at somebody else's `user_id`.
  `power_curve_snapshots` was missing this until
  `20260911_multi_user_hardening.sql`.
- **Column grants on `users`.** An RLS policy cannot restrict columns, so the
  Telegram link fields are revoked from `authenticated` and written only by the
  service role. Otherwise one athlete could claim another's chat id.
- **Credentials encrypted at rest** with AES-256-GCM using
  `TOKEN_ENCRYPTION_KEY`. A leaked database dump does not leak Garmin access.
- **OAuth CSRF** via a random `state` in an httpOnly cookie, compared in
  constant time. Granted Strava scopes are verified, since Strava lets users
  untick them.
- **Webhook and cron authentication.** Telegram's
  `X-Telegram-Bot-Api-Secret-Token`, Strava's `verify_token`, the daily cron's
  `Authorization: Bearer` and the Garmin sync's `x-cron-secret` are all compared
  in constant time.
- **Rate limiting** on `/api/coach`, `/api/auth/resolve` and `/api/auth/signup`.
  It is per-instance, so it stops runaway loops, not a determined attacker.
- **Invite-gated signup** when `SIGNUP_INVITE_CODE` is set. This only holds if
  Supabase's own signup is disabled in the dashboard.
- **Open-redirect guarded.** `next` parameters are only honoured when they are
  same-site relative paths.
- **Error bodies are never forwarded** from Gemini or provider token endpoints,
  because they can echo back the API key or client secret.
- **`handle_new_user()`** is `security definer` with a pinned `search_path` and
  `execute` revoked from `public`, `anon` and `authenticated`.
- **Middleware never touches `api/` or `auth/`**, so webhooks and OAuth
  callbacks are not redirected to the login page.

### Known gaps

- `/api/auth/resolve` maps a username to an email so the login form accepts
  either. Rate limited, but still an enumeration surface.
- The Strava webhook POST has no signature; Strava does not offer one.
- No error tracking. A failure for one athlete is only visible in the Vercel
  logs.

## Not built yet

- Race / event targets driving a taper.
- Any feedback loop on whether a prescription worked.
- Structured RPE, illness or injury handling.
- Strength progression tracking.
