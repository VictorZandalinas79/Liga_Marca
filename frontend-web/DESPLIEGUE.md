# Despliegue y automatización

Arquitectura:

- **Vercel** sirve el frontend Next.js (lee/escribe Supabase por JS). No corre Python.
- **GitHub Actions** corre el Python:
  - `sync-live.yml` → sincroniza partidos próximos/en vivo. **Lo dispara pg_cron
    desde Supabase**, no su propio `schedule` (ver §5).
  - `weekly-fixtures.yml` → lunes 06:00 UTC ejecuta `2. descarga_fixtures_y_sync.py`.
- **Supabase** es la base de datos compartida.

Los workflows viven en la **raíz del repo** (`.github/workflows/`), no en `frontend-web/`,
porque GitHub Actions solo lee los de la raíz. (El antiguo `frontend-web/.github/` queda
obsoleto y puede borrarse.)

---

## 1. Subir el código a GitHub

```bash
cd "/Users/imac/Programas/LFM Vilafranca"
git add .
git commit -m "Despliegue Vercel + sync automático por GitHub Actions"
git push origin main
```

> Los crons de GitHub solo se ejecutan sobre la rama por defecto (`main`).

## 2. Secrets en GitHub (Settings → Secrets and variables → Actions)

| Secret | Valor |
|--------|-------|
| `SUPABASE_URL` | URL de tu proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (Settings → API) |
| `SDAPI_OUTLET_KEY` | `ft1tiv1inq7v1sk3y9tv12yh5` |

Luego ve a la pestaña **Actions** y habilita los workflows si te lo pide.
Puedes probarlos a mano con **Run workflow** (workflow_dispatch).

## 3. Desplegar en Vercel

1. Importa el repo `Liga_Marca` en Vercel.
2. **Root Directory = `frontend-web`** (imprescindible: la app Next está en esa subcarpeta).
3. Framework: Next.js (autodetectado).
4. Variables de entorno (Settings → Environment Variables):

| Variable | Para qué |
|----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente Supabase (navegador) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente Supabase (navegador) |
| `GITHUB_DISPATCH_TOKEN` | PAT de GitHub con permiso `actions: write` sobre el repo (lo usa el botón "Sincronizar" para lanzar el workflow) |
| `GITHUB_OWNER` | *(opcional)* por defecto `VictorZandalinas79` |
| `GITHUB_REPO` | *(opcional)* por defecto `Liga_Marca` |

> NO pongas la `SERVICE_ROLE_KEY` en Vercel ni con prefijo `NEXT_PUBLIC_`: solo se usa
> en GitHub Actions (servidor), nunca en el navegador.

### Crear el `GITHUB_DISPATCH_TOKEN`

GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained token**:
- Repository access: solo `Liga_Marca`.
- Permisos: **Actions = Read and write**.
- Apunta la fecha de caducidad: cuando expira, "Sincronizar" deja de lanzar nada.

El mismo valor va en **tres sitios**, y hay que actualizar los tres al rotarlo:

| Dónde | Quién lo lee |
|-------|--------------|
| Vercel → Environment Variables (Production, Preview y Development) | `/api/sync-match` y `/api/sync-all-matches` en producción |
| `frontend-web/.env.local` | las mismas rutas en `npm run dev` (Next **no** lee el `.env` de la raíz) |
| `.env` de la raíz del repo | `frontend-web/scheduler.py` |

Sin token en `frontend-web/.env.local`, en local el botón no lanza GitHub Actions:
ejecuta `ci/run_live_sync.py` con el Python del venv. Sirve para depurar, pero no es
el mismo camino que producción.

### Comprobar que el token funciona

```bash
cd frontend-web
npm run check:token             # ¿válido y ve el workflow?
npm run check:token -- --dispatch   # además lanza un sync real
```

Para validar el valor que hay en Vercel sin tocar los ficheros:

```bash
GITHUB_DISPATCH_TOKEN=ghp_xxx npm run check:token
```

## 4. Cómo funciona cada objetivo

- **Automático cada 5 min hasta el final**: pg_cron (en Supabase) mira `fixtures` cada
  5 min y, si hay partidos en ventana (desde 30 min antes del pitido inicial hasta 3 h
  después, o `status='live'`), lanza `sync-live.yml` por workflow_dispatch con esos ids.
  El scorer marca `status='live'` mientras juega y `status='finished'` cuando la API
  emite el tiempo completo → a partir de ahí deja de tocarlo. Ver §5.
- **Lunes**: `weekly-fixtures.yml` actualiza fixtures, equipos y jugadores.
- **Botón "Sincronizar"**: dispara el workflow a demanda (modo IDs explícitos o jornada
  completa). El procesado ocurre en segundo plano; los puntos aparecen en 1-2 min.

## 5. El disparador automático (pg_cron en Supabase)

**Por qué no lo hace el `schedule` de GitHub.** Lo hacía, y no funcionaba. Contando las
ejecuciones reales de `sync-live.yml`, GitHub descartaba casi todos los huecos del cron
`*/5 * * * *`:

| Fecha | `schedule` (esperadas: 288) | `workflow_dispatch` |
|---|---|---|
| 2026-08-29 | 2 | 0 |
| 2026-08-28 | 2 | 108 |
| 2026-08-27 | 3 | 114 |
| 2026-08-26 | 24 | 59 |
| 2026-08-23 | 56 | 80 |
| 2026-08-19/20/21 | 0 | 23-36 |

Los `workflow_dispatch` terminaban todos en `success`: el motor de puntuación, las
ventanas y `run_live_sync.py` siempre estuvieron bien. El único eslabón roto era quién
apretaba el botón cada 5 min. Y esos dispatches venían de tener la página de Partidos
abierta, así que los puntos solo se procesaban cuando alguien miraba.

Los crons de alta frecuencia en el pool gratuito de GitHub no son fiables y no se
arregla desde el repo. **pg_cron es un cron real dentro de Postgres y no se salta
huecos.**

### Puesta en marcha (una sola vez)

1. Guarda el PAT en Vault (SQL Editor de Supabase). Es el **mismo** valor que
   `GITHUB_DISPATCH_TOKEN` en Vercel:

   ```sql
   select vault.create_secret(
     'ghp_elTokenDeVerdad',
     'github_dispatch_token',
     'PAT para lanzar sync-live.yml desde pg_cron'
   );
   ```

2. Aplica `supabase/migrations/027_pg_cron_live_sync.sql`. Crea las extensiones, la
   función `trigger_live_sync()`, la tabla de trazas `sync_runs` y programa el job.

3. Comprueba que va:

   ```sql
   select jobname, schedule, active from cron.job;   -- ¿programado?
   select public.trigger_live_sync('manual');        -- fuerza una pasada ahora
   select * from public.sync_runs_recent limit 20;   -- ¿qué respondió GitHub?
   ```

   En `sync_runs_recent`, `resultado = 'OK'` es un 204 de GitHub (disparo correcto).
   `TOKEN CADUCADO (401)` y `TOKEN SIN PERMISO Actions (403)` son los dos fallos
   típicos. Fuera de horario de partidos verás `nada en ventana`, que es lo correcto.

### Al rotar el token

Ahora el PAT vive en **cuatro** sitios, no tres. Además de los de §3:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'github_dispatch_token'),
  'ghp_elTokenNuevo'
);
```

### Redes de seguridad

Quedan tres caminos independientes al mismo motor, y el workflow tiene
`concurrency: sync-live`, así que los disparos duplicados no se pisan:

1. **pg_cron cada 5 min** — el principal.
2. **`schedule` de `sync-live.yml` a 1/hora** — por si Supabase se cayera.
3. **La página de Partidos abierta** — sigue disparando `/api/sync-all-matches` cada
   5 min, como hasta ahora.

Hay además un cuarto camino ya escrito y sin usar: `/api/cron/sync-live`, que hace la
misma decisión desde Vercel y se protege con `CRON_SECRET`. Si algún día quieres una
red más, basta con darlo de alta en un cron externo (cron-job.org) cada 5 min con el
header `Authorization: Bearer <CRON_SECRET>`. No hay que tocar código.

## Notas / límites

- El cron de GitHub puede retrasarse algunos minutos en horas punta, o **saltarse el
  hueco por completo**: por eso ya no es el disparador principal (§5).
- Repo público: minutos de Actions gratis e ilimitados. Aun así, con pg_cron solo se
  gasta una ejecución cuando de verdad hay partido en ventana, en vez de 288 diarias
  para descubrir que no hay nada que hacer.
- Ajusta la hora del cron semanal si quieres otra (`0 6 * * 1` = lunes 06:00 UTC).
