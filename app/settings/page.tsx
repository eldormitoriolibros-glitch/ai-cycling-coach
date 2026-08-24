import { StravaCard } from '@/components/StravaCard'
import { TelegramCard } from '@/components/TelegramCard'
import { telegramEnv } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const CALLBACK_MESSAGES: Record<string, { variant: 'error' | 'success'; text: string }> = {
  connected: { variant: 'success', text: 'Strava conectado. Ya podés sincronizar.' },
  denied: { variant: 'error', text: 'Cancelaste la autorización en Strava.' },
  invalid_state: { variant: 'error', text: 'La sesión de autorización expiró. Probá de nuevo.' },
  missing_scope: {
    variant: 'error',
    text: 'Falta el permiso "Ver todas tus actividades". Reconectá y aceptá todos los permisos.',
  },
  not_authenticated: { variant: 'error', text: 'Iniciá sesión antes de conectar Strava.' },
  exchange_failed: { variant: 'error', text: 'Strava rechazó la conexión. Probá de nuevo.' },
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { strava?: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: connection }, { data: profile }] = await Promise.all([
    supabase
      .from('strava_connections')
      .select('athlete_id, connection_status, last_sync_at, last_sync_error')
      .eq('user_id', user!.id)
      .maybeSingle(),
    supabase.from('users').select('telegram_chat_id').eq('id', user!.id).maybeSingle(),
  ])

  const telegram = telegramEnv()
  const callbackMessage = searchParams.strava ? CALLBACK_MESSAGES[searchParams.strava] : undefined

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Conexiones</h1>
      <p className="text-sm text-slate-600">
        Strava es la fuente de datos. Si usás un Garmin, dejá que sincronice a Strava y las
        actividades llegan acá solas.
      </p>

      <StravaCard
        connected={Boolean(connection)}
        athleteId={connection?.athlete_id ?? null}
        lastSyncAt={connection?.last_sync_at ?? null}
        lastSyncError={connection?.last_sync_error ?? null}
        status={connection?.connection_status ?? null}
        initialMessage={callbackMessage ?? null}
      />

      <TelegramCard
        configured={telegram !== null}
        linked={Boolean(profile?.telegram_chat_id)}
        botUsername={telegram?.TELEGRAM_BOT_USERNAME ?? null}
      />
    </div>
  )
}
