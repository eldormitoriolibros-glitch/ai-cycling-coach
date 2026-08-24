# Deployment

Local development is covered in the [README](../README.md). This is the path to a
public HTTPS origin, which is what Strava and Telegram webhooks require.

## 1. Git

The project is intentionally not a Git repository yet. When you create one, set a
**local** identity first so a work account is never used:

```powershell
git init
git config user.name  "your name"
git config user.email "your-personal@email"
git add .
git commit -m "Initial commit"
```

`.gitignore` already excludes `.env*` (except `.env.example`), `node_modules`,
and `.next`. Verify before the first push:

```powershell
git status --short
```

Then create a **private** repository under your personal GitHub account and push.

## 2. Vercel

1. <https://vercel.com> → **Add New → Project** → import the repository.
2. Framework preset is detected as Next.js. No build settings to change.
3. Add every variable from `.env.example` under **Settings → Environment
   Variables**, with `NEXT_PUBLIC_SITE_URL` set to the production URL
   (`https://<project>.vercel.app`, no trailing slash).
4. Deploy.

Free Hobby tier is enough. Note it is for non-commercial use.

## 3. Supabase

1. **Authentication → URL Configuration**: set *Site URL* to the Vercel URL and
   add `https://<project>.vercel.app/**` to the redirect allow-list.
2. **Authentication → Providers → Email**: turn *Confirm email* back on for
   production.
3. Free projects **pause after 7 days of inactivity**. Opening the app resumes
   it; a paused project makes webhooks fail silently, so if activities stop
   appearing, check this first.

## 4. Strava

1. <https://www.strava.com/settings/api> → set **Authorization Callback Domain**
   to your bare production host (`your-project.vercel.app`, no scheme, no path).
2. Register the webhook subscription once:

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=$STRAVA_CLIENT_ID \
  -F client_secret=$STRAVA_CLIENT_SECRET \
  -F callback_url=https://<your-domain>/api/strava/webhook \
  -F verify_token=$STRAVA_WEBHOOK_VERIFY_TOKEN
```

Strava immediately calls `GET /api/strava/webhook` with a challenge; the route
answers it. Confirm and inspect with:

```bash
curl -G https://www.strava.com/api/v3/push_subscriptions \
  -d client_id=$STRAVA_CLIENT_ID -d client_secret=$STRAVA_CLIENT_SECRET
```

One subscription is allowed per application. Delete the old one before
re-registering after a domain change.

Rate limits on the free tier: 200 requests per 15 minutes and 2000 per day. A
personal sync uses a handful.

## 5. Telegram

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d url=https://<your-domain>/api/telegram/webhook \
  -d secret_token=$TELEGRAM_WEBHOOK_SECRET
```

Check it took:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

## 6. Daily cron

[`vercel.json`](../vercel.json) schedules `/api/cron/daily` at 09:00 UTC. Set
`CRON_SECRET` in the Vercel environment; Vercel sends it as
`Authorization: Bearer <value>` and the route rejects anything else.

The job syncs Strava, reconciles past sessions against actual rides, and sends
one Telegram nudge per athlete per local day.

Limitations on the Hobby plan: **two cron jobs, once per day each**, fired at a
fixed UTC hour. Pick the hour that suits your timezone. Trigger it by hand with:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/daily
```

## 7. Local webhook testing

Webhooks need a public URL. Tunnel instead of deploying:

```powershell
cloudflared tunnel --url http://localhost:3000
```

Set `NEXT_PUBLIC_SITE_URL` to the tunnel URL while testing, and remember Strava
allows only one subscription per app.

## 8. Rotating secrets

- `TOKEN_ENCRYPTION_KEY` — rotating it makes stored Strava tokens undecryptable.
  Disconnect and reconnect Strava afterwards.
- `STRAVA_CLIENT_SECRET` — re-register the webhook subscription.
- `TELEGRAM_WEBHOOK_SECRET` — re-run `setWebhook`.
- `CRON_SECRET` — update in Vercel; no other step needed.
- `SUPABASE_SERVICE_ROLE_KEY` — rotate in Supabase, then update Vercel.

## Cost

| Service | Plan | Limit that matters |
| --- | --- | --- |
| Vercel | Hobby | Non-commercial use |
| Supabase | Free | 500 MB database; pauses after 7 idle days |
| Strava | Free | 200 requests / 15 min |
| Gemini | Free tier | Daily request cap per model |
| Telegram | Free | None relevant |

Total: nothing.
