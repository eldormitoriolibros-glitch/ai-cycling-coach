# Plan de internacionalización (español / inglés)

> **Estado: no empezado.** `next-intl` no está instalado y todo el texto sigue
> hardcodeado en español. Es una propuesta, no una descripción del código.

Objetivo: que la app se pueda usar en español o inglés con un selector, sin romper nada de
lo que ya funciona y sin dejar la mitad de los textos hardcodeados. Este documento está
escrito para ejecutarse por fases, cada una con criterios de aceptación verificables.
Al final hay un prompt listo para pasarle a un modelo que haga la implementación.

## 1. Estado actual

- Next.js 14.2 (App Router), React 18, TypeScript estricto, Tailwind.
- **Todo** el texto visible está hardcodeado en español, en ~45 archivos `.tsx` de
  `app/` y `components/`.
- Hay español además en ~33 archivos de `lib/`, que es la parte difícil: no son
  etiquetas de UI sino texto generado (títulos de sesión, hints de estado de forma,
  mensajes de Telegram, prompts del entrenador).
- Las fechas se formatean con `'es-AR'` hardcodeado en 15 lugares
  (`toLocaleDateString`, `toLocaleString`, `Intl.DateTimeFormat`).
- No hay ninguna librería de i18n instalada.

## 2. Decisiones ya tomadas (no re-discutir)

1. **Librería: `next-intl`.** Es el estándar para App Router, soporta Server Components
   sin trucos y trae formateo de fechas/números y plurales ICU.
2. **Sin routing por idioma.** No se agregan segmentos `/[locale]/` a las rutas: eso
   obligaría a mover todas las páginas y a reescribir cada `<Link>`, `redirect()` y
   `middleware.ts`. El idioma se resuelve por cookie + preferencia guardada en la base.
   Es el modo "without i18n routing" que la librería documenta y soporta oficialmente.
3. **Idioma por defecto: español.** Un usuario existente sin preferencia guardada sigue
   viendo exactamente lo que ve hoy.
4. **La preferencia vive en la base (`users.locale`), no solo en la cookie.** El bot de
   Telegram y los cron jobs escriben fuera de un request del navegador: no tienen cookie.
   La cookie es solo la vía rápida para renderizar.
5. **Los textos ya guardados en la base no se migran.** Los `workouts.title` y
   `workouts.description` que ya existen quedan en el idioma en que se generaron. Se
   traduce la generación de ahí en adelante (fase 4). Es una limitación aceptada y hay
   que documentarla en el propio código, no esconderla.

## 3. Las cuatro capas de texto

Tratarlas por separado; mezclarlas es lo que hace que estos proyectos queden a medias.

| Capa | Dónde | Estrategia |
| --- | --- | --- |
| A. UI estática | `app/**/*.tsx`, `components/**/*.tsx` | Diccionarios `messages/es.json` y `messages/en.json` + `useTranslations` |
| B. Fechas y números | 15 usos de `'es-AR'` | Helper único que recibe el locale; `useFormatter` en componentes |
| C. Texto generado por código | `lib/training/*`, `lib/coach/nudge-format.ts`, `lib/coach/week-agenda.ts`, `lib/training/form-status.ts`, `lib/training/readiness.ts` | Las funciones reciben `locale` y traducen con `getTranslations` del server |
| D. Texto generado por el modelo | `lib/coach/index.ts` (RULES), `lib/coach/session-review.ts` (REVIEW_RULES) | Una línea en el prompt: "Escribí siempre en {idioma}". No se traduce el prompt entero |

La capa D es la más barata y la de mayor impacto: el entrenador responde en inglés con
una sola línea agregada al prompt. Hacerla temprano.

## 4. Fases

### Fase 0 — Andamiaje (no cambia ningún texto todavía)

1. `npm install next-intl`. **Verificar el peer range contra Next 14.2 / React 18**; si
   la última major pide Next 15, instalar la última v3. No actualizar Next.
2. `next.config.js`: envolver la config con `createNextIntlPlugin()`.
3. `i18n/request.ts` con `getRequestConfig`: lee la cookie `locale`, default `'es'`,
   e importa `messages/${locale}.json`. Ojo: en Next 14 `cookies()` es **sincrónico**
   (el `await cookies()` de la doc es de Next 15).
4. `messages/es.json` y `messages/en.json`, por ahora con una sola clave de prueba.
5. `app/layout.tsx`: envolver `children` con `NextIntlClientProvider` y poner
   `<html lang={locale}>`.
6. Migración `supabase/migrations/009_user_locale.sql`:
   `alter table public.users add column if not exists locale text not null default 'es';`
   Agregar `locale` a `UserRow` en `lib/types/database.ts`.

**Aceptación:** `npm run type-check` y `npm test` pasan; la app arranca y se ve idéntica.

### Fase 1 — Selector de idioma

1. En `app/settings/page.tsx`, junto a las demás preferencias, un selector es/en.
2. Al cambiar: server action que escribe la cookie `locale` **y** `users.locale`, y
   hace `revalidatePath('/', 'layout')`.
3. En `i18n/request.ts`, si no hay cookie, caer a `users.locale` del usuario logueado
   antes de caer al default. Así el idioma sobrevive a un dispositivo nuevo.

**Aceptación:** cambiar el idioma persiste tras cerrar sesión y volver a entrar desde
otro navegador. La clave de prueba de la fase 0 cambia de idioma.

### Fase 2 — Fechas y números

1. Un solo módulo `lib/i18n/format.ts` que exponga los formatos que usa la app
   (`formatDayMonth`, `formatWeekday`, `formatDateTime`, `formatDateRange`) y reciba
   `locale: string` como parámetro.
2. Reemplazar los 15 `'es-AR'` por llamadas a ese módulo. En componentes cliente, usar
   `useLocale()` para obtener el locale; en funciones de `lib/`, pasarlo como argumento.
3. Mapear el locale a un locale de `Intl` real: `es` → `es-AR`, `en` → `en-GB`
   (día antes que mes, más cercano al hábito actual; no `en-US`).

**Aceptación:** `rg "'es-AR'" app components lib` no devuelve nada fuera de
`lib/i18n/format.ts`. Las semanas del calendario siguen empezando el lunes en ambos
idiomas (esto es lógica de negocio, **no** depende del locale: no tocar
`lib/calendar/weeks.ts` más allá de las etiquetas).

### Fase 3 — UI estática

Ruta por ruta, no todo de una. Orden sugerido por valor: `app/page.tsx` (dashboard) →
`app/plan` → `app/activities` → `app/coach` → `app/recovery` → `app/settings` →
componentes compartidos.

Convenciones obligatorias:

- **Namespace por componente o ruta**, igual que el nombre del archivo:
  `"PlanBoard": { "markDone": "Hecho" }`. Nada de un namespace `common` gigante.
- **Nunca concatenar** strings traducidos. Usar interpolación ICU:
  `"lastSync": "Última sincronización: {date}"`.
- **Plurales con ICU**, no con `n === 1 ? … : …`:
  `"{count, plural, =0 {Sin bloques} one {# bloque} other {# bloques}}"`.
- Las claves se nombran por **significado**, no por el texto:
  `emptyState`, no `noHayActividadesTodavia`.
- `es.json` y `en.json` tienen **exactamente** las mismas claves. Si no sabés la
  traducción, poné la mejor que tengas; no dejes la clave afuera.
- Componentes cliente que hoy reciben strings por props desde el servidor: preferir que
  el componente traduzca con `useTranslations` en vez de recibir el texto ya traducido.

**Aceptación por ruta:** la ruta se ve igual en español, y en inglés no queda ni un
string en español. Verificable con `rg "[áéíóúñ¿¡]" <archivo>`.

### Fase 4 — Texto generado por código

Este es el trabajo real. Archivos, en orden de importancia:

- `lib/training/form-status.ts` — etiquetas de banda y hints de forma/fatiga/fitness/rampa.
- `lib/training/readiness.ts` — labels y flags de readiness.
- `lib/training/planner.ts`, `planner2.ts`, `session-notes.ts`,
  `session-prescription.ts`, `workout-blocks.ts` — títulos y descripciones de sesión.
- `lib/coach/nudge-format.ts`, `lib/coach/week-agenda.ts` — mensajes de Telegram.

Patrón: la función pura recibe `t` (una función de traducción) o `locale`, nunca importa
el diccionario por su cuenta. Así los tests siguen siendo unitarios y sincrónicos.

```ts
// antes
band === 'very_low' ? 'Fitness bajando rápido: …' : …
// después
t(`ramp.${band}`)
```

Cuidado especial con `lib/training/session-prescription.ts`: **parsea** texto en español
con regex (`recuperación`, `descanso`, `suaves`). Si se generan descripciones en inglés,
el parser tiene que reconocer también `recovery`, `rest`, `easy`. Hay tests en
`tests/session-rest.test.ts`; agregar casos en inglés antes de tocar el parser.

**Aceptación:** `npm test` pasa; con locale `en`, un plan recién generado no tiene
palabras en español y las tarjetas de sesión siguen mostrando los bloques bien.

### Fase 5 — El entrenador (LLM)

1. En `buildAthleteContext` (`lib/coach/context.ts`), incluir el idioma del usuario.
2. En `RULES` (`lib/coach/index.ts`) y `REVIEW_RULES` (`lib/coach/session-review.ts`),
   una regla: "Escribí siempre en {idioma}, sin importar en qué idioma te escriban."
3. El bloque ```plan``` JSON **no cambia de forma**: las claves siguen en inglés
   (`title`, `description`, `target_zone`, `purpose`); solo los valores van en el idioma
   del usuario.
4. El webhook de Telegram (`app/api/telegram/webhook/route.ts`) tiene comandos
   hardcodeados (`/hoy`, `/semana`, `/bici`, `/fuerza`) y el `HELP`. Aceptar **los dos**
   juegos de comandos siempre (`/today`, `/week`, `/ride`, `/strength`) y traducir solo
   el `HELP` y las respuestas.

**Aceptación:** con locale `en`, el chat del entrenador y la devolución post-sesión que
llega por Telegram están en inglés.

## 5. Errores a evitar en este repo

- **No** meter rutas `/[locale]/`: `middleware.ts` hace auth de Supabase y romperlo deja
  la app sin sesión.
- **No** traducir claves de la base de datos ni valores de enum (`status`, `workout_type`,
  `source`, `target_zone`). Se traducen solo al mostrarlos.
- **No** cambiar el cálculo de semanas ni el timezone. `lib/training/dates.ts` mezcla
  formateo (traducible) con lógica de fechas (intocable): separar antes de traducir.
- **No** usar `next-intl` dentro de rutas de API ni de crons vía hooks; ahí va
  `getTranslations({locale})` con el locale leído de `users.locale`.
- **No** hacer un commit gigante. Un commit por fase, con `type-check` y `test` en verde.

## 6. Esfuerzo estimado

| Fase | Tamaño |
| --- | --- |
| 0 andamiaje | chico (1 sesión) |
| 1 selector | chico |
| 2 fechas | chico-medio, 15 sitios |
| 3 UI estática | grande, ~45 archivos, es el grueso |
| 4 texto generado | medio-grande, es lo delicado |
| 5 LLM | chico, alto impacto |

Fases 0, 1, 2 y 5 solas ya dan una app "en inglés" para el entrenador y las fechas.
Se puede parar ahí y hacer la 3 de a poco.

---

## 7. Prompt para pasarle al modelo que implemente

> Trabajás en `trainer`, una app Next.js 14 (App Router, React 18, TypeScript estricto,
> Tailwind, Supabase) que hoy está enteramente en español. Vas a agregarle soporte de
> inglés. El plan completo está en `docs/i18n-plan.md`: **leelo entero antes de escribir
> una línea de código y seguilo al pie de la letra.**
>
> Reglas de trabajo:
>
> 1. Implementá **una fase por vez**, en orden. Al terminar cada fase corré
>    `npm run type-check` y `npm test`, y no pases a la siguiente hasta tenerlos en verde.
>    Contame qué hiciste y pará.
> 2. Las decisiones de la sección 2 del plan ya están tomadas. No propongas alternativas:
>    `next-intl`, sin routing por idioma, default español, preferencia en `users.locale`.
> 3. No refactorices nada que no sea parte de la fase. Nada de renombrar, reordenar
>    imports ni "de paso arreglo esto".
> 4. Respetá el estilo del repo: comentarios solo cuando explican una restricción que el
>    código no muestra, nunca para narrar lo que hace la línea de abajo. Español en los
>    comentarios nuevos solo si el archivo ya los tiene así; el resto del repo comenta en
>    inglés.
> 5. Si una traducción al inglés te queda dudosa, elegí la mejor y seguí. No dejes claves
>    faltantes ni `TODO`.
> 6. Si encontrás algo que el plan no previó, pará y preguntá en vez de improvisar.
>
> Empezá por la Fase 0.
