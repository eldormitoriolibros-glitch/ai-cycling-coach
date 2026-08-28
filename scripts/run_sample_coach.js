const fs = require('fs');
const path = require('path');

async function main() {
  const envPath = path.resolve(__dirname, '..', '.env.local');
  const env = fs.readFileSync(envPath, 'utf8');
  const vars = Object.fromEntries(
    env
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );

  const SUPABASE_URL = vars.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY = vars.SUPABASE_SERVICE_ROLE_KEY;
  const GEMINI_KEY = vars.GEMINI_API_KEY;
  const GEMINI_MODEL = vars.GEMINI_MODEL || 'gemini-3.6-flash';

  if (!SUPABASE_URL || !SERVICE_KEY || !GEMINI_KEY) {
    console.error('Missing required keys in .env.local');
    process.exit(1);
  }

  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    Accept: 'application/json',
  };

  const fetchJson = async (url) => {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase error ${res.status}: ${body}`);
    }
    return res.json();
  };

  // 1) pick first user
  const users = await fetchJson(`${SUPABASE_URL}/rest/v1/users?select=id&limit=1`);
  if (!users.length) {
    console.error('No users found in DB.');
    process.exit(1);
  }
  const userId = users[0].id;
  console.log('Using user id:', userId);

  // helper to qs encode
  const qs = (obj) =>
    Object.entries(obj)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

  // fetch profile
  const profile = (await fetchJson(
    `${SUPABASE_URL}/rest/v1/users?select=*&id=eq.${userId}`
  ))[0];

  const metrics = (await fetchJson(
    `${SUPABASE_URL}/rest/v1/athlete_metrics?select=*&user_id=eq.${userId}`
  ))[0];

  const availability = await fetchJson(
    `${SUPABASE_URL}/rest/v1/availability?select=*&user_id=eq.${userId}`
  );

  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: profile?.timezone || 'UTC' }).format(
    new Date()
  );
  const since10 = (() => {
    const d = new Date(todayIso + 'T00:00:00Z');
    d.setDate(d.getDate() - 10);
    return d.toISOString().slice(0, 10);
  })();

  const training_load = await fetchJson(
    `${SUPABASE_URL}/rest/v1/training_load?select=date,daily_load,chronic_load,acute_load,form,ramp_rate&user_id=eq.${userId}&order=date.desc&limit=15`
  );

  const activities = await fetchJson(
    `${SUPABASE_URL}/rest/v1/activities?select=start_time,title,sport_type,distance_meters,moving_seconds,avg_power,normalized_power,intensity_factor,avg_hr,max_hr,avg_cadence,elevation_gain_meters,is_trainer,training_load&user_id=eq.${userId}&order=start_time.desc&limit=10`
  );

  const workouts = await fetchJson(
    `${SUPABASE_URL}/rest/v1/workouts?select=scheduled_date,title,workout_type,duration_minutes,status,target_zone,target_power,target_hr,purpose,completed_activity_id&user_id=eq.${userId}&scheduled_date=gte.${since10}&order=scheduled_date.asc&limit=20`
  );

  const recovery = await fetchJson(
    `${SUPABASE_URL}/rest/v1/recovery_metrics?select=date,resting_hr,hrv,soreness,motivation&user_id=eq.${userId}&order=date.desc&limit=7`
  );

  const sleep = await fetchJson(
    `${SUPABASE_URL}/rest/v1/sleep?select=date,duration_minutes,sleep_score&user_id=eq.${userId}&order=date.desc&limit=7`
  );

  const plan_weeks = await fetchJson(
    `${SUPABASE_URL}/rest/v1/plan_weeks?select=start_date,end_date,emphasis,block_position,target_load,planned_load&user_id=eq.${userId}&order=start_date.desc&limit=1`
  );

  // build compact context (similar to lib/coach/context.ts)
  const lines = [];
  const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const tz = profile?.timezone || 'UTC';
  const weekday = new Intl.DateTimeFormat('es-AR', { timeZone: tz, weekday: 'long' }).format(new Date());
  lines.push('## Hoy');
  lines.push(`fecha: ${todayIso} (${weekday}). Usá esta fecha como referencia para "hoy", "mañana" y los días de la semana.`);
  lines.push('');
  lines.push('## Atleta');
  const atParts = [
    profile?.name && `nombre: ${profile.name}`,
    profile?.age && `edad: ${profile.age}`,
    profile?.sex && `sexo: ${profile.sex}`,
    profile?.weight_kg && `peso: ${profile.weight_kg} kg`,
    profile?.height_cm && `altura: ${profile.height_cm} cm`,
    profile?.experience_level && `nivel: ${profile.experience_level}`,
    profile?.timezone && `zona horaria: ${profile.timezone}`,
  ].filter(Boolean);
  lines.push(atParts.join(', ') || 'sin datos de perfil cargados');
  lines.push('');
  lines.push('## Umbrales');
  lines.push(
    [
      metrics?.ftp ? `FTP: ${metrics.ftp} W (${metrics.ftp_source === 'estimated' ? 'estimado por la app' : 'cargado a mano'})` : 'FTP: no cargado',
      metrics?.max_hr ? `FC máx: ${metrics.max_hr}` : 'FC máx: no cargada',
      metrics?.resting_hr ? `FC reposo: ${metrics.resting_hr}` : 'FC reposo: no cargada',
    ].join(', ')
  );
  lines.push('');
  lines.push('## Disponibilidad semanal');
  if (availability?.length) {
    availability.sort((a,b)=>a.day_of_week-b.day_of_week).forEach(a=>{
      const parts = [];
      if (a.bike_minutes>0) parts.push(`${(a.bike_minutes/60).toFixed(1)} h bici`);
      if (a.strength_minutes>0) parts.push(`${(a.strength_minutes/60).toFixed(1)} h fuerza`);
      lines.push(`- ${DAYS[a.day_of_week]}: ${parts.join(', ')}`);
    })
  } else lines.push('- no configurada');
  lines.push('');
  lines.push('## Carga de entrenamiento (calculada por la app)');
  if (training_load?.length) {
    const latest = training_load[0];
    lines.push(`fecha: ${latest.date}, fitness/CTL: ${Math.round(latest.chronic_load)||'n/d'}, fatiga/ATL: ${Math.round(latest.acute_load)||'n/d'}, forma/TSB: ${Math.round(latest.form)||'n/d'}, rampa 7d: ${Math.round(latest.ramp_rate)||'n/d'}`);
  } else {
    lines.push('sin datos suficientes');
  }
  lines.push('');
  lines.push('## Últimas 10 actividades');
  if (activities?.length) {
    for (const a of activities) {
      const date = new Date(a.start_time).toISOString().slice(0,10);
      const parts = [`${date} · ${a.title ?? a.sport_type ?? 'actividad'}`, `${(a.distance_meters||0/1000).toFixed(1)} km`, `${Math.floor((a.moving_seconds||0)/3600)}h ${Math.floor(((a.moving_seconds||0)%3600)/60)}m`];
      if (a.avg_power) parts.push(`${Math.round(a.avg_power)} W`);
      if (a.normalized_power) parts.push(`NP ${Math.round(a.normalized_power)} W`);
      if (a.intensity_factor) parts.push(`IF ${Number(a.intensity_factor).toFixed(2)}`);
      if (a.avg_hr) parts.push(`${a.avg_hr} ppm`);
      if (a.training_load) parts.push(`carga ${Math.round(a.training_load)}`);
      lines.push(`- ${parts.join(' · ')}`);
    }
  } else lines.push('- ninguna sincronizada todavía');
  lines.push('');
  lines.push('## Entrenamientos prescriptos (últimos 10 días y próximos 7)');
  if (workouts?.length) {
    const today = new Date().toISOString().slice(0,10);
    for (const w of workouts) {
      const when = w.scheduled_date < today ? 'pasado' : w.scheduled_date === today ? 'hoy' : 'futuro';
      const extras = [];
      if (w.target_zone) extras.push(w.target_zone);
      if (w.target_power) extras.push(`${w.target_power} W`);
      if (w.target_hr) extras.push(`${w.target_hr} ppm`);
      lines.push(`- ${w.scheduled_date} (${when}) · ${w.title ?? w.workout_type ?? 'sesión'} · ${w.duration_minutes ?? '?'} min${extras.length ? ' · ' + extras.join(' / ') : ''} · estado: ${w.status}`);
    }
  }

  const context = lines.join('\n');
  // SYSTEM RULES (shortened to be safe)
  const RULES = `Sos un entrenador de ciclismo personal. Hablás en español rioplatense, directo y cálido.
Reglas: 1) Usá SOLO los datos del contexto. 2) No das diagnósticos médicos. 3) Sé concreto: duración, zona o potencia y por qué.`;

  const systemInstruction = [RULES, '\n# Contexto del atleta\n', context].join('\n');
  const userMessage = '¿Qué debería entrenar hoy?';

  // Call Gemini
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 1500 },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  const candidate = json?.candidates?.[0];
  const text = candidate?.content?.parts?.map(p=>p.text||'').join('') || JSON.stringify(json);
  console.log('--- System instruction preview ---\n');
  console.log(systemInstruction.slice(0, 4000));
  console.log('\n--- Coach reply ---\n');
  console.log(text);
}

main().catch((err)=>{ console.error(err); process.exit(1); });

