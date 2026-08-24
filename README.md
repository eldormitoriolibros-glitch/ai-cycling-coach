# AI Cycling Coach

Personal cycling coach. Next.js 14 (App Router) + Supabase + Strava.

Everything runs on free tiers: Supabase free project, Strava API, Vercel Hobby,
Google Gemini free tier, Telegram Bot API.

## Setup

### 1. Install

```powershell
npm install
Copy-Item .env.example .env.local
```

### 2. Supabase

1. Create a project at <https://supabase.com/dashboard>.
2. **SQL Editor** → run `supabase/migrations/001_initial_schema.sql`, then
   `002_power_recovery_periodisation.sql`, in that order.
   (Or `supabase db reset` if you use the CLI. `001` expects a fresh database.)
3. **Project Settings → API** → copy the URL, the `anon` key and the
   `service_role` key into `.env.local`.
4. **Authentication → Providers → Email**: for local testing, turn *Confirm
   email* off so signup logs you straight in. Leave it on for production.
5. **Authentication → URL Configuration** → add `http://localhost:3000/**` to
   the redirect allow-list.

### 3. Token encryption key

Strava tokens are stored AES-256-GCM encrypted, never in plaintext.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Put the output in `TOKEN_ENCRYPTION_KEY`.

### 4. Strava

1. <https://www.strava.com/settings/api> → create an application.
2. Set **Authorization Callback Domain** to `localhost` for development
   (just the host, no scheme or path).
3. Copy the Client ID and Client Secret into `.env.local`.
4. Invent any string for `STRAVA_WEBHOOK_VERIFY_TOKEN`.

### 5. Google Gemini (the coach's brain)

1. <https://aistudio.google.com/apikey> → **Create API key**. Free tier, no card.
2. Put it in `GEMINI_API_KEY`. `GEMINI_MODEL` defaults to `gemini-2.0-flash`.

Without this key the app still runs; the **Entrenador** page just tells you the
key is missing.

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

Bot commands: `/hoy` for today's session, `/ayuda` for help. Anything else goes
straight to the coach.

### 7. Daily job (optional)

Once deployed, [`vercel.json`](vercel.json) runs `/api/cron/daily`: it syncs
Strava, marks past sessions as done or skipped based on whether you actually
rode, and sends the Telegram nudge. Set `CRON_SECRET` for it to run:

```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

### 8. Run

```powershell
npm run dev
```

Sign up, fill in the profile (FTP and heart rates drive the load estimates),
then go to **Conexiones** and connect Strava.

## Strava webhooks (optional)

Webhooks need a public HTTPS URL, so this only works once deployed (or through
a tunnel such as `cloudflared tunnel --url http://localhost:3000`).

Register the subscription once:

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=$STRAVA_CLIENT_ID \
  -F client_secret=$STRAVA_CLIENT_SECRET \
  -F callback_url=https://<your-domain>/api/strava/webhook \
  -F verify_token=$STRAVA_WEBHOOK_VERIFY_TOKEN
```

Without a webhook, use **Sincronizar ahora** on the Conexiones page. First sync
pulls the last 180 days; later syncs only pull what changed.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run type-check` | `tsc --noEmit` |

## Layout

```
app/
  api/coach/         Coach chat endpoint
  api/cron/daily/    Nightly sync + reconcile + Telegram nudge
  api/strava/        OAuth, manual sync, disconnect, webhook
  api/telegram/      Link-code issuing, bot webhook
  api/training/      Load recalculation, FTP adoption, plan propose/commit
  auth/callback/     Supabase email-confirmation landing route
  activities/        Synced activity list
  coach/             Chat UI
  plan/              Weekly plan proposal and agenda
  power/             Power curve, estimated FTP, training zones
  recovery/          Manual sleep / HRV / soreness entry
  settings/          Provider connections
lib/
  ai/gemini.ts       Gemini REST call
  coach/             System prompt, athlete context, conversation flow, daily nudge
  crypto.ts          AES-256-GCM helpers for stored OAuth tokens
  env.ts             zod-validated server environment
  strava/            API client, token refresh, sync, mapping, stream backfill
  supabase/          browser / server / service-role / middleware clients
  telegram/          Bot API client
  training/load.ts        TSS estimation (power, with a heart-rate fallback)
  training/rollup.ts      CTL / ATL / TSB series
  training/power-curve.ts Mean-maximal power, pure
  training/ftp.ts         FTP estimation from the power curve
  training/planner.ts     Pure weekly plan builder
  training/reconcile.ts   Closes out past sessions against actual rides
  types/database.ts  Mirror of the SQL schema
supabase/migrations/ Database schema
```

## Power and FTP

Per-second samples are **not** stored. After each sync, rides recorded with a
power meter have their watts stream fetched once, reduced to a mean-maximal
curve (5s, 15s, 1min, 5min, 8min, 20min, 60min) and saved as ~6 numbers on the
activity row. About 1 KB per ride instead of ~7000 rows.

FTP is then estimated over a 90-day window as the best of:

$$\max\left(P_{60},\; 0.95 \cdot P_{20},\; 0.90 \cdot P_{8}\right)$$

The **Potencia** page shows the curve, the estimate and where it came from. It is
never applied silently — you press the button, and the server re-verifies the
number before accepting it.

## Planning

[`lib/training/planner.ts`](lib/training/planner.ts) is a pure function. Given
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

Nothing is written to the database until you press **Aprobar**. Approving replaces
only sessions still marked *scheduled* — anything you already completed is left
alone.

## Metrics

| Value | How it is derived |
| --- | --- |
| Training load (TSS) | `(s × NP × IF) / (FTP × 3600) × 100`, or a heart-rate-reserve fallback when there is no power |
| Fitness (CTL) | 42-day exponentially-weighted average of daily load |
| Fatigue (ATL) | 7-day exponentially-weighted average of daily load |
| Form (TSB) | Yesterday's CTL minus yesterday's ATL |

All four are recomputed after every sync, and after any FTP or heart-rate change.
They are this app's own estimates, not Strava or Garmin values.

## Notes

- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. It is only imported by modules
  marked `server-only`; never reference it from a client component.
- Derived metrics (training load, intensity factor) are computed here and are
  not vendor-provided values.
- Garmin's developer program is approval-only and aimed at business partners,
  so Garmin devices are read through Strava instead.
- The coach is told never to invent data, never to give medical advice, and to
  ask for confirmation before changing an existing plan.
