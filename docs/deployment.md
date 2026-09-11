# Deployment

Local development is covered in the [README](../README.md). This is the path to a
public HTTPS origin, which is what the Telegram (and optional Strava) webhooks
require.

## 1. Git

The project lives in a **private** GitHub repository. `.gitignore` excludes
`.env*` (except `.env.example`), `node_modules` and `.next`. Verify before any
push that no secret slipped in:

```powershell
git status --short
```

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
3. **Authentication → Sign In / Providers**: turn **off** *Allow new users to
   sign up* as soon as the deployment is reachable by anyone else, and set
   `SIGNUP_INVITE_CODE` so new athletes come in through `/api/auth/signup`.
   Without the dashboard switch the invite code is bypassable from the browser.
4. Run every migration in `supabase/migrations/` in filename order. In
   particular `20260911_multi_user_hardening.sql` must be applied before a
   second athlete gets an account.
5. Free projects **pause after 7 days of inactivity**. Opening the app resumes
   it; a paused project makes webhooks fail silently, so if activities stop
   appearing, check this first.

## 4. Strava (optional)

Skip this section entirely if you only use Garmin: leave `STRAVA_CLIENT_ID`,
`STRAVA_CLIENT_SECRET` and `STRAVA_WEBHOOK_VERIFY_TOKEN` unset and the app
hides the Strava card.

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

For every athlete the job syncs Garmin (and Strava when connected), reconciles
past sessions against actual rides, and sends the coach's review for whatever
closed since the last run. There is no morning briefing.

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

- `TOKEN_ENCRYPTION_KEY` — rotating it makes stored Garmin and Strava
  credentials undecryptable. Every athlete has to reconnect afterwards.
- `STRAVA_CLIENT_SECRET` — re-register the webhook subscription.
- `TELEGRAM_WEBHOOK_SECRET` — re-run `setWebhook`.
- `CRON_SECRET` — update in Vercel; no other step needed.
- `SIGNUP_INVITE_CODE` — update in Vercel and tell whoever still needs it.
- `SUPABASE_SERVICE_ROLE_KEY` — rotate in Supabase, then update Vercel.

## Cost

| Service | Plan | Limit that matters |
| --- | --- | --- |
| Vercel | Hobby | Non-commercial use; 300 s per function |
| Supabase | Free | 500 MB database; pauses after 7 idle days |
| Gemini | Free tier | Daily request cap per model, **shared by every athlete** |
| Strava | Free | 200 requests / 15 min |
| Telegram | Free | None relevant |

Total: nothing. The first thing to run out with several athletes is the Gemini
daily cap, which is why `/api/coach` is rate limited per user.
