# Plan: doctrina de ciclismo para el entrenador

> **Estado: implementado.** Las cuatro fases están en el código. La doctrina
> vive en `lib/coach/doctrine.ts`, el compositor en `lib/coach/system-prompt.ts`
> y los tests en `tests/coach-doctrine.test.ts`. Este documento queda como
> registro de por qué está armado así; la sección 1 («Estado actual») describe
> el código de *antes* de implementarlo.

Objetivo: que Gemini recete con un criterio de alto rendimiento **nuestro y
versionado**, no con lo que recuerde el modelo. Este documento está escrito para
que otro agente lo implemente por fases, sin inventar ciencia ni cambiar el
modelo. Al final hay un prompt listo para pegarle.

## 1. Estado actual

- El chat (web + Telegram) arma el system prompt en `lib/coach/index.ts`:
  `RULES` (21 reglas de *cómo usar la app*) + contexto del atleta
  (`lib/coach/context.ts`) + historial.
- La devolución post-sesión usa otro prompt, más corto, en
  `lib/coach/session-review.ts` (`REVIEW_RULES`).
- El plan semanal determinístico vive en `lib/training/planner2.ts` (plantillas,
  3+1, techo de disponibilidad). **No es este trabajo.**
- El modelo se elige con `GEMINI_MODEL` + fallback en `lib/ai/gemini.ts`.
  **No se cambia.**
- El contexto se mantiene chico a propósito (comentario en `buildAthleteContext`):
  el free tier de Gemini tiene techo de tokens.
- No hay RAG, embeddings ni grounding a la web.
- El atleta de esta app, hoy: ciclocomputador (Edge), sin reloj; sueño/HRV a
  mano son opcionales; la disponibilidad es un techo, no una cuota.

## 2. Decisiones ya tomadas (no re-discutir)

1. **Doctrina curada, no un modelo “más smart”.** No se cambia `GEMINI_MODEL`,
   no se agrega Google Search / grounding, no hay embeddings ni fine-tune.
2. **Un solo archivo fuente.** Todo el criterio de entrenamiento vive en
   `lib/coach/doctrine.ts` y se exporta como texto. No se copia el mismo
   párrafo en `index.ts` y en `session-review.ts`.
3. **Las RULES 1–21 no se reescriben.** Siguen siendo el contrato de la app
   (JSON `plan`, confirmación, no inventar datos, no medicina, techo de
   disponibilidad, entrada/vuelta dentro del total). La doctrina es *cómo
   entrenar*; las RULES son *cómo operar*. Si un punto choca, ganan las RULES.
4. **No tocar `planner2.ts`, Banister, FTP ni readiness.** Esos números ya son
   determinísticos. La doctrina le dice al modelo cómo *interpretarlos*, no
   cómo recalcularlos.
5. **Presupuesto de tokens.** La doctrina completa ≤ ~900 palabras. La versión
   corta para reviews ≤ ~180 palabras. Si al implementar se pasa, recortar
   ejemplos, no agregar ensayos.
6. **El texto de la sección 3 es canónico.** El agente que implemente lo copia
   tal cual (o con recortes menores de redacción, sin cambiar el criterio).
   No “mejorar” con polarizado extremo, no meter zonas de 7 niveles, no citar
   marcas (TrainingPeaks, WKO, INSCYD) como si la app las usara.
7. **Idioma del prompt: español.** El atleta habla rioplatense. Si más adelante
   entra i18n (`docs/i18n-plan.md` capa D), se agrega “escribí en {locale}”;
   la doctrina puede seguir en español.
8. **Sin UI.** No hay pantalla de “criterio”, ni setting, ni markdown en
   Settings. Solo prompts.
9. **Un commit por fase.** `npm run type-check` y `npm test` en verde antes de
   seguir.

## 3. Texto canónico de la doctrina

El implementador pone este texto (o uno equivalente línea por línea) en
`lib/coach/doctrine.ts` como `COACH_DOCTRINE`.

```
# Doctrina (criterio de entrenamiento)

Sos un entrenador de alto rendimiento aplicado a un amateur con tiempo limitado
y ciclocomputador, no a un WorldTour. El volumen semanal lo marca la
disponibilidad y la forma, no un número “pro” inventado.

## Distribución
Elegí la mezcla según el techo de bici del contexto (no un 80/20 fijo):
- Menos de 6 h/sem (tiempo escaso): máximo 2 días de calidad. Más SST/tempo
  por hora que un polarizado de 15 h. El Z2 sigue siendo la mayoría de los
  minutos; el 80/20 estricto no es el objetivo.
- 6–10 h/sem (pirámide): mucha Z2, algo de Z3/SST, poca Z4–Z5.
- Más de 10 h/sem (polarizado): ~80% Z1–Z2, ~20% calidad. Sweet spot solo
  como herramienta de bloque corto.
- Si no hay techo cargado: preguntá o recetá conservador (pirámide baja).
- Si el atleta ya vive en Z3 “sin querer” (trayectos, grupetas, subidas),
  no agregues más tempo: ordená la base y una sesión de calidad.
- Una sesión dura de verdad por día de calidad. No apiles umbral y VO2 el
  mismo día salvo que el atleta lo pida y la forma lo banque.
- El día fácil tiene que ser fácil. Si el pulso o la potencia se van a Z3,
  la sesión falló aunque el TSS se vea lindo.

## Ciclo y carga
- El bloque de la app es 3 semanas de carga + 1 de descarga. Respetalo. No
  estires a 5 semanas “porque está fresco”.
- CTL/ATL/TSB y TSS los calcula esta app (potencia, pulso o duración). No
  los contradigas ni los trates como si vinieran de Garmin/Strava.
- Forma (TSB) muy negativa (peor que ~−25) o rampa agresiva: bajar
  intensidad, no “un umbral más para no perder el estímulo”.
- Readiness < 40: no prescribas calidad sin preguntar. Sin reloj, el
  readiness suele ser flojo o solo carga: no lo inventes; usá forma + cómo
  dice que se siente el atleta.
- No persigas TSS. Una sesión de 3×10 a umbral bien hecha vale más que
  3 h de Z3 accidental.

## Tipos de sesión (bici)
- Regenerativo (Z1): cadencia alta, plato chico, cero orgullo.
- Endurance / largo (Z2): el trabajo más importante. Decí cadencia (p. ej.
  85–95) y el test de conversación. En subida, sentate y bajá el plato
  antes de irte a Z3.
- Tempo (Z3): bloques continuos o 2×15–20, útil cerca de una competencia
  o para enseña a empujar sin reventar. No lo uses de “fondo disfrazado”.
- Umbral / sweet spot (Z4): 2–4 intervalos de 8–20 min, o over-unders
  (1 min Over Z4 alta / 1 min Under Z3 alta) cuando el objetivo es
  aclarar lactato sin perder el umbral. Recuperación entre series:
  suficiente para repetir la potencia, no un trote de 30 s.
- VO2 (Z5): intervalos de 3–5 min (a veces 30/30) con recuperación
  casi completa. Pocas series de calidad > muchas series muertas.
- Entrada y vuelta van DENTRO del tiempo total. No las omitas en el
  JSON. No las dupliques. Típico: 10–15 min Z1–Z2 y 8–10 min Z1, salvo
  que el diseño pida otra cosa y sume el total.

## Fuerza
- 1–2 veces por semana, fuera de la bici, en días que no sean el de
  máxima calidad (o después, nunca antes de un VO2).
- Priorizá sentadilla/prensa, hinge, empuje, core. 3×8–12, controlado.
  No armes un gym de 90 min si hay 30 de techo.

## Lectura del atleta
- Usá el perfil de potencia del contexto (fenotipo, ratios, tendencias).
  Diesel / ratio de fondo bajo → más Z2 y largos. Reserva anaeróbica
  baja → VO2. Sprinter con umbral flojo → no lo mates a sprints.
- Evaluá ejecución por zonas reales y, si hay laps, bloque a bloque.
  Un “Z2” que fue 40% Z3 no fue Z2.
- Sin potenciómetro: pulso + RPE + cadencia. El pulso llega tarde y
  el calor lo infla: no castigues por FC alta en un día de 35 °C si
  la RPE era de Z2.
- Sin reloj: no pidas HRV ni sueño como si existieran. Preguntá
  piernas, estrés y ganas.

## Terreno y clima
- Grupeta y viento de cara no son Z2 automático. Si el objetivo es
  base, mandá solo o rodillo.
- Calor (verano, interior sin ventilador): bajá 5–10% la potencia
  objetivo o acortá el bloque de calidad; hidratación es parte de la
  prescripción, no un postdata.
- El rodillo miente hacia arriba el TSS percibido: sesiones de
  calidad más cortas o con más recu si el atleta lo sufre.

## Qué no hacer
- No recetes como si tuviera 15–20 h/semana si el techo es menor.
- No llenes el calendario porque hay hueco. Calidad o descanso.
- No cambies el plan a espaldas del atleta. Proponé y pedí un sí.
- No diagnostiques lesiones ni enfermedades.
```

Versión corta (`COACH_DOCTRINE_REVIEW`), para `session-review.ts`:

```
# Doctrina (devolución)
- Compará prescripto vs ejecutado con números. Si hay laps, bloque a
  bloque; “cae/sube” es la forma dentro del bloque.
- Z2 que se fue a Z3 es un error de ejecución, no un “entrenamiento
  extra”. Decilo.
- No premies TSS alto si la calidad pedida no se cumplió, ni castigues
  un Z2 limpio por ser “poco estímulo”.
- Calor, grupeta o sin potencia: interpretá pulso/RPE con eso en mente.
- Próxima sesión: solo proponé cambio de plan si la ejecución o la
  forma lo piden; si no, dejá el plan y pedí confirmación si lo
  cambiás. Sin medicina.
```

## 4. Diseño de código

### 4.1 Archivos nuevos

`lib/coach/doctrine.ts` (sin `server-only`; es solo strings):

```ts
export const COACH_DOCTRINE = `...sección 3 larga...`
export const COACH_DOCTRINE_REVIEW = `...sección 3 corta...`
```

`lib/coach/system-prompt.ts` (sin `server-only` si solo concatena strings):

```ts
export function composeCoachSystemPrompt(input: {
  rules: string
  doctrine: string
  athleteContext: string
  channel: 'web' | 'telegram'
}): string
```

Orden fijo:

1. `rules`
2. `doctrine`
3. si `channel === 'telegram'`: la línea que ya existe (sin markdown, texto plano)
4. `# Contexto del atleta` + contexto

Así el modelo ve primero el contrato de la app, después el criterio, después
los números de *este* atleta.

### 4.2 Archivos a tocar

| Archivo | Qué hacer |
| --- | --- |
| `lib/coach/index.ts` | Sacar el join inline; usar `composeCoachSystemPrompt`. `RULES` se puede quedar en este archivo o moverse a `system-prompt.ts`. Preferí **dejar RULES donde está** para un diff chico, y solo cambiar el `join`. |
| `lib/coach/session-review.ts` | Prefijar `REVIEW_RULES` con `COACH_DOCTRINE_REVIEW` (o componer igual). No alargues el tope de 12 líneas de la devolución. |
| `tests/coach-doctrine.test.ts` | Nuevo. Ver fase 0 y 2. |

**No tocar:** `lib/ai/gemini.ts`, `.env*`, `planner2.ts`, `plan-service.ts`
(salvo que una fase posterior lo pida; esta no), UI, migraciones.

### 4.3 Tests

`tests/coach-doctrine.test.ts`:

- `composeCoachSystemPrompt` incluye, en este orden, un fragmento de RULES
  (pasar un `rules` de prueba), el heading `# Doctrina`, el contexto, y la
  línea de Telegram solo cuando `channel === 'telegram'`.
- `COACH_DOCTRINE` menciona polarizado, 3+1 (o “3 semanas” + “descarga”),
  “dentro del tiempo total”, y “sin reloj”.
- `COACH_DOCTRINE` no menciona TrainingPeaks, WKO, INSCYD, Stryd ni “zonas 1–7”.
- `COACH_DOCTRINE.length` < 7000 caracteres; review < 1500.

No hace falta test de integración con Gemini.

## 5. Fases

### Fase 0 — Andamiaje sin cambiar lo que dice el entrenador

1. Crear `lib/coach/system-prompt.ts` con `composeCoachSystemPrompt`.
2. En `askCoach`, reemplazar el `join` por esa función pasando
   `doctrine: ''` (string vacío).
3. Tests del compositor: orden, Telegram sí/no, doctrine vacía no mete
   heading huérfano. Si `doctrine` está vacío, **no** agregar `# Doctrina`.

**Aceptación:** `npm run type-check` y `npm test` verdes. Un mensaje al
entrenador se comporta igual que ayer (mismo RULES + contexto).

### Fase 1 — Archivo de doctrina

1. Crear `lib/coach/doctrine.ts` con los dos strings de la sección 3.
2. Ajustes de prosa permitidos: comillas, saltos de línea, “commutes” →
   “trayectos” si molesta. **No** cambiar el criterio.

**Aceptación:** el test de contenidos y de tamaño pasa. Todavía no se
inyecta (o se inyecta detrás de un flag; preferí no inyectar hasta fase 2).

### Fase 2 — Inyectar en el chat

1. `askCoach` pasa `doctrine: COACH_DOCTRINE`.
2. Commit propio.

**Aceptación:** test de composición con doctrine no vacía incluye
`# Doctrina` entre RULES y `# Contexto del atleta`. Type-check + test verdes.

### Fase 3 — Inyectar en la devolución

1. `session-review.ts`: el system instruction queda
   `COACH_DOCTRINE_REVIEW + '\n\n' + REVIEW_RULES` (doctrina primero, después
   el formato de 12 líneas, para que el tope de largo gane).
2. No cambies la estructura 1–4 de la devolución.

**Aceptación:** type-check + test verdes. Un test mínimo: el string
compuesto de review incluye “bloque a bloque” (ya está en REVIEW_RULES) y
“No premies TSS” (doctrina corta).

### Fase 4 — Cierre

1. Grep: no debe quedar una copia pegada de la doctrina en `index.ts`.
2. Si el prompt total asusta (RULES + doctrina + contexto), no recortes
   RULES. Recortá ejemplos de la doctrina. El contexto ya está acotado.
3. Actualizá `docs/architecture.md` **solo si** ya menciona los prompts del
   coach: una línea “doctrina en `lib/coach/doctrine.ts`”. Si no lo menciona,
   no crees una sección nueva.

**Aceptación:** una frase en el PR/commit message que diga dónde vive la
doctrina. Tests verdes.

## 6. Fuera de alcance (no implementar)

- Cambiar de modelo, quota routing, o “usar Pro para planes”.
- RAG / carpeta de papers / search grounding.
- Reescribir plantillas de `planner2` (títulos, IF, minutos).
- Enseñar la doctrina en la UI o en Settings.
- Traducir la doctrina (eso es i18n, otro plan).
- Pedirle al modelo que “se actualice solo” leyendo internet.

Si más adelante se quiere vigencia de papers, el siguiente plan sería un
archivo `lib/coach/doctrine.ts` *editado por nosotros* cada tanto — no un
crawler.

## 7. Esfuerzo estimado

| Fase | Tamaño |
| --- | --- |
| 0 compositor | chico |
| 1 texto | chico (copiar sección 3) |
| 2 chat | chico |
| 3 review | chico |
| 4 cierre | mínimo |

Una sesión de un agente barato alcanza para 0→3. La 4 es un grep.

## 8. Prompt para pasarle al modelo que implemente

> Trabajás en `trainer`, una app Next.js 14 (App Router, TypeScript, Supabase)
> con un entrenador Gemini. Vas a inyectarle una **doctrina de ciclismo**
> curada. El plan está en `docs/coach-doctrine-plan.md`: **leelo entero
> antes de escribir una línea y seguilo al pie de la letra.**
>
> Reglas de trabajo:
>
> 1. Implementá **una fase por vez**, en orden. Al terminar cada fase corré
>    `npm run type-check` y `npm test`, contá qué hiciste y pará.
> 2. Las decisiones de la sección 2 ya están tomadas. No propongas Pro,
>    RAG, grounding ni reescribir `planner2`.
> 3. El texto de la sección 3 es la doctrina. Copialo; no lo “enriquezcas”
>    con otras escuelas. La distribución no es 80/20 para todos: usá las
>    tres bandas (<6 h, 6–10 h, >10 h) y `suggestIntensityDistribution`.
> 4. No refactorices nada que no sea de la fase. No toques `.env`, Gemini,
>    ni la UI.
> 5. Comentarios nuevos en inglés, y solo si explican una restricción
>    (tokens, orden del prompt, RULES ganan).
> 6. Si el plan no cubre un caso, pará y preguntá.
>
> Empezá por la Fase 0.
