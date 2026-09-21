# AI Cycling Coach

Personal cycling coach. Next.js 14 (App Router) + Supabase + Garmin + Telegram +
Google Gemini.

Everything runs on free tiers: Supabase free project, Vercel Hobby, Gemini free
tier, Telegram Bot API. Garmin is read by logging into Garmin Connect with your
own credentials; Strava is an optional backup.

## What it does

- **Imports your rides** from Garmin Connect, including laps, and estimates
  training load per activity from power, heart rate or, failing both, duration.
- **Tracks fitness, fatigue and form** (CTL / ATL / TSB) computed here, never
  copied from a vendor.
- **Plans the week** with a deterministic planner constrained by your declared
  availability, and records each approved week so 3-on / 1-off blocks work.
- **Talks to you** on the web and on Telegram. The coach can propose a plan
  change, but nothing is written until you confirm it.
- **Reviews every finished session**: prescribed against executed, block by
  block when you used the lap button, with a verdict the app computes and the
  model only narrates.

## Setup

### 1. Install

```powershell
npm install
Copy-Item .env.example .env.local
```

### 2. Supabase

1. Create a project at <https://supabase.com/dashboard>.
2. **SQL Editor** → run everything in `supabase/migrations/` in filename order.
   `001` expects a fresh database.
3. **Project Settings → API** → copy the URL, the `anon` key and the
   `service_role` key into `.env.local`.
4. **Authentication → Providers → Email**: for local testing, turn *Confirm
   email* off so signup logs you straight in.
5. **Authentication → URL Configuration** → add `http://localhost:3000/**` to
   the redirect allow-list.

### 3. Token encryption key

Garmin and Strava credentials are stored AES-256-GCM encrypted, never in
plaintext.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Put the output in `TOKEN_ENCRYPTION_KEY`.

### 4. Garmin (the main data source)

Nothing to register. Open **Conexiones**, enter your Garmin Connect email and
password, and the app logs in on your behalf and stores the session tokens
encrypted. From there it pulls activities, FIT files (laps, temperature,
respiration) and daily health data.

There is no Garmin developer API involved: their program is approval-only and
aimed at corporate partners.

### 5. Google Gemini (the coach's brain)

1. <https://aistudio.google.com/apikey> → **Create API key**. Free tier, no card.
2. Put it in `GEMINI_API_KEY`. `GEMINI_MODEL` defaults to `gemini-3.6-flash`.

Without this key the app still runs; the **Entrenador** page just tells you the
key is missing, and session reviews are skipped.

### 6. Telegram (optional)

1. Message [@BotFather](https://t.me/botfather) → `/newbot` → copy the token into
   `TELEGRAM_BOT_TOKEN`.
2. Invent a string for `TELEGRAM_WEBHOOK_SECRET`.
3. Optionally set `TELEGRAM_BOT_USERNAME` so the UI can show `@yourbot`.

The webhook needs a public HTTPS URL, so register it after deploying (or through
a tunnel):

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d url=https://<your-domain>/api/telegram/webhook \
  -d secret_token=$TELEGRAM_WEBHOOK_SECRET
```

Then open **Conexiones**, press *Vincular Telegram*, and send the bot
`/vincular <code>`. The code is single-use.

Bot commands:

| Command | What it does |
| --- | --- |
| `/hoy` | Today's session |
| `/semana` | This week's plan |
| `/bici` | Marks today's ride done, pulls it from Garmin and sends the review |
| `/fuerza` | Marks today's strength session done |
| `/devolucion` | Reviews the last completed session (or a day you name) |
| `/vincular <code>` | Links the chat to your account |
| `/ayuda` | Help |

Anything else goes straight to the coach.

### 7. Strava (optional backup)

Only needed if you want Strava as a second source. Leave `STRAVA_CLIENT_ID`,
`STRAVA_CLIENT_SECRET` and `STRAVA_WEBHOOK_VERIFY_TOKEN` unset and the Strava
card disappears; everything else keeps working.

### 8. Daily job (optional)

Once deployed, [`vercel.json`](vercel.json) runs `/api/cron/daily`: for every
athlete it syncs Garmin (and Strava if connected) and marks past sessions done
or skipped based on whether they actually rode. It does not send session
reviews: those go out when you mark a session done or ask for one. Set
`CRON_SECRET` for it to run:

```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

### 9. Run

```powershell
npm run dev
```

Sign up, fill in the profile (FTP and heart rates drive the load estimates) and
your weekly availability, then go to **Conexiones** and connect Garmin.

## Sharing with other people

This started as a single-athlete app. Before giving anyone else an account:

1. Run `supabase/migrations/20260911_multi_user_hardening.sql`. It adds the
   missing RLS on `power_curve_snapshots` and stops the browser from writing
   the Telegram link columns on `users`.
2. Set `SIGNUP_INVITE_CODE` **and** turn off *Allow new users to sign up* in the
   Supabase dashboard. The code alone is not enough: without the dashboard
   switch the browser can call Supabase signup directly.
3. Remember the Gemini quota is shared by everyone on the deployment.
   `/api/coach` is limited to 20 messages per athlete per 10 minutes.

Known remaining gap: `/api/auth/resolve` maps a username to an email address so
you can log in without typing the full address. It is rate limited, but it is
still an enumeration surface. Drop username login if that matters to you.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run type-check` | `tsc --noEmit` |
| `npm test` | Vitest |

## Layout

```
app/
  api/coach/         Coach chat endpoint
  api/cron/daily/    Nightly sync + reconcile
  api/garmin/        Connect, sync, archive import, backfill, rebuild
  api/strava/        OAuth, manual sync, disconnect, webhook (optional)
  api/telegram/      Link-code issuing, bot webhook
  api/training/      Load recalculation, FTP adoption, plan propose/commit,
                     per-session review
  activities/        Synced activity list and per-ride detail
  calendar/          Month / six-month / year activity views
  coach/             Chat UI
  plan/              Weekly plan proposal and agenda
  power/             Power curve, estimated FTP, training zones
  recovery/          Optional manual sleep / HRV / soreness entry
  settings/          Provider connections
lib/
  ai/gemini.ts            Gemini REST call with model fallback
  coach/doctrine.ts       The training doctrine injected into every prompt
  coach/system-prompt.ts  Composes rules + doctrine + athlete context
  coach/context.ts        Compact athlete snapshot for the model
  coach/session-review.ts Post-session feedback
  coach/session-compare.ts Deterministic prescribed-vs-executed verdict
  coach/apply-plan.ts     Persists a plan only after the athlete confirms
  crypto.ts               AES-256-GCM helpers, constant-time compare
  env.ts                  zod-validated server environment
  garmin/                 Login, activity sync, FIT parsing, laps, backfill
  rate-limit.ts           In-memory fixed-window limiter
  strava/                 Optional second source
  supabase/               browser / server / service-role / middleware clients
  training/planner2.ts    Pure weekly plan builder
  training/plan-service.ts Proposes, explains and commits plans
  training/load.ts        TSS estimation (power, HR or duration)
  training/rollup.ts      CTL / ATL / TSB series
  training/decoupling.ts  Pw:Hr drift on long steady rides
  training/reconcile.ts   Closes out past sessions against actual rides
  types/database.ts       Mirror of the SQL schema
supabase/migrations/      Database schema
```

## Power and FTP

Per-second samples are kept only for charts on recent rides. For FTP, each ride
with power is reduced to a mean-maximal curve (5s, 15s, 1min, 5min, 8min, 20min,
60min) and saved as ~6 numbers on the activity row.

FTP is then estimated over a 90-day window as the best of:

$$\max\left(P_{60},\; 0.95 \cdot P_{20},\; 0.90 \cdot P_{8}\right)$$

The **Potencia** page shows the curve, the estimate and where it came from. It is
never applied silently — you press the button, and the server re-verifies the
number before accepting it.

## Planning

[`lib/training/planner2.ts`](lib/training/planner2.ts) is a pure function. Given
availability, FTP, heart rates, CTL, TSB and how deep you are into the current
block, it produces a week:

1. Pick an emphasis — **forced *descarga* after 3 consecutive loading weeks**,
   otherwise *descarga* when TSB < −25, *carga* when TSB > 5, else *mantenimiento*.
2. Target weekly load = CTL × 7, scaled by that emphasis and capped at 90% of the
   time you actually have.
3. Place 0–2 hard days, never back to back, biggest windows first.
4. Longest remaining window becomes the long ride; the rest is Z2.
5. Scale every duration to hit the target, drop anything under 30 minutes.

Each approved week is recorded in `plan_weeks`, which is what makes the 3-on /
1-off block work. A gap in training restarts the block.

Gemini only writes the paragraph explaining the week. It cannot change a number,
and the plan still works with no API key.

Nothing is written to the database until you press **Aprobar**. Approving
replaces only sessions still marked *scheduled*, and only the same kind of
session on the same date — shortening a ride never deletes that day's strength
work.

## The coach

Three layers, in this order inside the system prompt:

1. **Rules** (`lib/coach/index.ts`) — how to operate the app: the hidden
   ```plan``` JSON contract, ask before changing anything, never invent data,
   no medical advice, respect the availability ceiling.
2. **Doctrine** (`lib/coach/doctrine.ts`) — how to train. Intensity
   distribution picked from your weekly bike ceiling (under 6 h, 6–10 h, over
   10 h), 3+1 blocks, session design, reading an athlete with no watch.
3. **Athlete context** (`lib/coach/context.ts`) — your actual numbers.

Plan changes go proposal → confirmation → write. The coach embeds a ```plan```
block the athlete never sees; saying *sí* on Telegram, or pressing the button on
the web, is what persists it.

Session reviews get a fourth input: a verdict computed by
`lib/coach/session-compare.ts` (*como lo prescripto*, *más duro*, *más corto*,
*calidad incompleta*…). The model is told to copy it rather than form its own.

## Metrics

| Value | How it is derived |
| --- | --- |
| Training load (TSS) | `(s × NP × IF) / (FTP × 3600) × 100`, with heart-rate-reserve and duration fallbacks |
| Fitness (CTL) | 42-day exponentially-weighted average of daily load |
| Fatigue (ATL) | 7-day exponentially-weighted average of daily load |
| Form (TSB) | Yesterday's CTL minus yesterday's ATL |

All four are recomputed after every sync, and after any FTP or heart-rate change.
They are this app's own estimates, not Garmin or Strava values.

## Notes

- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. It is only imported by modules
  marked `server-only`; never reference it from a client component.
- Derived metrics (training load, intensity factor) are computed here and are
  not vendor-provided values.
- The coach is told never to invent data, never to give medical advice, and to
  ask for confirmation before changing an existing plan.
