const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

function loadEnv(p) {
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    const k = m[1].trim()
    let v = m[2].trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
}

loadEnv('.env.local')
loadEnv('.env')

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

;(async () => {
  const { data, error } = await sb
    .from('garmin_connections')
    .update({
      backfill_status: 'idle',
      backfill_error: null,
      backfill_cursor: 0,
      backfill_processed: 0,
      backfill_started_at: null,
      backfill_finished_at: null,
    })
    .not('user_id', 'is', null)
    .select('garmin_email, backfill_status, backfill_processed')

  console.log(JSON.stringify({ data, error }, null, 2))
})()
