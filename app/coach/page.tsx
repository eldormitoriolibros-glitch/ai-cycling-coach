import { CoachChat } from '@/components/CoachChat'
import { Alert } from '@/components/ui'
import { isAiConfigured } from '@/lib/ai/gemini'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function CoachPage({
  searchParams,
}: {
  searchParams?: { start?: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: messages }, { data: brief }] = await Promise.all([
    supabase
      .from('coach_messages')
      .select('id, direction, channel, message, created_at')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('training_briefs').select('user_id').eq('user_id', user!.id).maybeSingle(),
  ])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Entrenador</h1>

      {!isAiConfigured() && (
        <Alert variant="info">
          Falta configurar <code>GEMINI_API_KEY</code> en <code>.env.local</code>. Conseguí una
          clave gratis en aistudio.google.com/apikey.
        </Alert>
      )}

      <CoachChat
        initialMessages={(messages ?? []).reverse()}
        startPropose={searchParams?.start === 'propose'}
        hasBrief={Boolean(brief)}
      />
    </div>
  )
}
