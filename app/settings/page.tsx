import { GarminConnectCard } from '@/components/GarminConnectCard'
import { GarminImportCard } from '@/components/GarminImportCard'
import { StravaCard } from '@/components/StravaCard'
import { SyncUnsyncedButton } from '@/components/SyncUnsyncedButton'
import { DecouplingBackfillButton } from '@/components/DecouplingBackfillButton'
import { PolarizationBackfillButton } from '@/components/PolarizationBackfillButton'
import { TelegramCard } from '@/components/TelegramCard'
import { Card } from '@/components/ui'
import { stravaEnv, telegramEnv } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
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

  const admin = createAdminClient()
  const [{ data: connection }, { data: profile }, { data: garminConn }] = await Promise.all([
    supabase
      .from('strava_connections')
      .select('athlete_id, connection_status, last_sync_at, last_sync_error')
      .eq('user_id', user!.id)
      .maybeSingle(),
    supabase.from('users').select('telegram_chat_id').eq('id', user!.id).maybeSingle(),
    admin
      .from('garmin_connections')
      .select('garmin_email, last_sync_at, last_sync_error')
      .eq('user_id', user!.id)
      .maybeSingle(),
  ])

  const telegram = telegramEnv()
  const stravaConfigured = stravaEnv() !== null
  const callbackMessage = searchParams.strava ? CALLBACK_MESSAGES[searchParams.strava] : undefined

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Conexiones</h1>
      <p className="text-sm text-muted">
        Garmin Connect es la fuente principal: trae las actividades con todos los datos del sensor
        (pulso, temperatura, respiración) más sueño, estrés y Body Battery. Strava es opcional y
        sirve como respaldo si no tenés un Garmin.
      </p>

      <GarminConnectCard
        initial={{
          connected: Boolean(garminConn),
          email: garminConn?.garmin_email ?? null,
          lastSyncAt: garminConn?.last_sync_at ?? null,
          lastSyncError: garminConn?.last_sync_error ?? null,
        }}
      />

      <GarminImportCard />

      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">Rellenar datos faltantes</h2>
          <p className="mt-1 text-sm text-muted">
            Trae el detalle segundo a segundo de las salidas que entraron sin streams. Sin eso no
            hay zonas, ni curva de potencia, ni comparación con el plan.
          </p>
        </div>
        <SyncUnsyncedButton />
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">Analizar historial aeróbico</h2>
          <p className="mt-1 text-sm text-muted">
            Recorre tus salidas viejas y calcula el desacople aeróbico (cuánto se despega el pulso
            de los vatios) de las que sirven: largas, estables y con potenciómetro. Corre una sola
            vez por salida y después se arma la tendencia en Potencia.
          </p>
        </div>
        <DecouplingBackfillButton />
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">Analizar polarización 80/20</h2>
          <p className="mt-1 text-sm text-muted">
            Recorre tus salidas y cuenta el tiempo en suave, tempo e intenso. Con pulso alcanza;
            si más adelante hay FTP, las salidas con potenciómetro se miden en vatios. El gráfico
            vive con la carga.
          </p>
        </div>
        <PolarizationBackfillButton />
      </Card>

      <TelegramCard
        configured={telegram !== null}
        linked={Boolean(profile?.telegram_chat_id)}
        botUsername={telegram?.TELEGRAM_BOT_USERNAME ?? null}
      />

      {(stravaConfigured || connection) && (
        <div className="pt-2">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Respaldo</p>
          <StravaCard
            configured={stravaConfigured}
            connected={Boolean(connection)}
            athleteId={connection?.athlete_id ?? null}
            lastSyncAt={connection?.last_sync_at ?? null}
            lastSyncError={connection?.last_sync_error ?? null}
            status={connection?.connection_status ?? null}
            initialMessage={callbackMessage ?? null}
          />
        </div>
      )}
    </div>
  )
}
