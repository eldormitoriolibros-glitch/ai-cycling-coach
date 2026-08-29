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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('missing env')
  process.exit(1)
}

const sb = createClient(url, key)

;(async () => {
  const { data, error } = await sb
    .from('garmin_connections')
    .select(
      'garmin_email, last_sync_at, backfill_status, backfill_cursor, backfill_processed, backfill_error, backfill_started_at, backfill_finished_at, updated_at'
    )
  if (error) {
    console.error(error)
    process.exit(1)
  }
  console.log(JSON.stringify(data, null, 2))

  const { count: garminActs } = await sb
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'garmin')
  const { count: withTemp } = await sb
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .not('avg_temperature', 'is', null)
  const { count: withResp } = await sb
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .not('avg_respiration_rate', 'is', null)

  console.log(JSON.stringify({ garminActs, withTemp, withResp }, null, 2))
})()
