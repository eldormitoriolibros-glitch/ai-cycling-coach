const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

function loadEnv(p) {
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    const k = m[1].trim()
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
}

loadEnv('.env.local')
loadEnv('.env')

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

;(async () => {
  const { count: total } = await sb.from('activities').select('id', { count: 'exact', head: true })
  const { count: strava } = await sb.from('activities').select('id', { count: 'exact', head: true }).eq('source', 'strava')
  const { count: garmin } = await sb.from('activities').select('id', { count: 'exact', head: true }).eq('source', 'garmin')
  const { count: withTemp } = await sb.from('activities').select('id', { count: 'exact', head: true }).not('avg_temperature', 'is', null)
  const { count: withResp } = await sb.from('activities').select('id', { count: 'exact', head: true }).not('avg_respiration_rate', 'is', null)

  const { data: conn } = await sb
    .from('garmin_connections')
    .select('backfill_status, backfill_processed, backfill_cursor')
    .maybeSingle()

  console.log(JSON.stringify({ total, strava, garmin, withTemp, withResp, backfill: conn }, null, 2))
})()
