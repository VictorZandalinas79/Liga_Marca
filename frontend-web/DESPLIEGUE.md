# Despliegue y automatización

Arquitectura:

- **Vercel** sirve el frontend Next.js (lee/escribe Supabase por JS). No corre Python.
- **GitHub Actions** corre el Python:
  - `sync-live.yml` → cada 5 min sincroniza partidos próximos/en vivo.
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
- Copia el token y pégalo en Vercel como `GITHUB_DISPATCH_TOKEN`.

## 4. Cómo funciona cada objetivo

- **Automático cada 5 min hasta el final**: `sync-live.yml` busca en `fixtures` los
  partidos que empiezan en ≤6 min o llevan <140 min jugando y `status != finished`.
  El scorer marca `status='live'` mientras juega y `status='finished'` cuando la API
  emite el tiempo completo → a partir de ahí el cron deja de tocarlo.
- **Lunes**: `weekly-fixtures.yml` actualiza fixtures, equipos y jugadores.
- **Botón "Sincronizar"**: dispara el workflow a demanda (modo IDs explícitos o jornada
  completa). El procesado ocurre en segundo plano; los puntos aparecen en 1-2 min.

## Notas / límites

- El cron de GitHub puede retrasarse algunos minutos en horas punta (no es exacto al segundo).
- Repos privados: 2000 min/mes gratis de Actions; cada pasada vacía dura ~20-40 s.
- Ajusta la hora del cron semanal si quieres otra (`0 6 * * 1` = lunes 06:00 UTC).
