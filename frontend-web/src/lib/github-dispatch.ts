// Dispara un workflow de GitHub Actions vía workflow_dispatch.
// Funciona en Vercel: es solo una llamada HTTP autenticada, sin Python local.
//
// Variables de entorno necesarias (configurar en Vercel):
//   GITHUB_DISPATCH_TOKEN  -> PAT con permiso "actions: write" sobre el repo
//   GITHUB_OWNER           -> opcional (por defecto VictorZandalinas79)
//   GITHUB_REPO            -> opcional (por defecto Liga_Marca)
//   GITHUB_REF             -> opcional (rama, por defecto main)

const OWNER = process.env.GITHUB_OWNER || 'VictorZandalinas79'
const REPO = process.env.GITHUB_REPO || 'Liga_Marca'
const REF = process.env.GITHUB_REF || 'main'
const WORKFLOW = 'sync-live.yml'

export type DispatchInputs = {
  fixture_ids?: string
  matchday?: string
}

export type DispatchResult =
  | { dispatched: true }
  // Ya había un sync en marcha y no se ha lanzado otro
  | { dispatched: false; activeRunId: number }

import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'

// ── Límite global de disparos ──────────────────────────────────────────────
// sync-live.yml tiene `cancel-in-progress: true`: cada disparo nuevo mata al
// que está corriendo. Un sync completo tarda ~135 s, y el margen de 5 min entre
// disparos del frontend vive en sessionStorage, o sea, es POR PESTAÑA: con
// varios usuarios mirando un partido llegaban disparos cada pocos segundos
// (medido el 12/09/2026) y ningún sync habría llegado a terminar.
//
// El cerrojo es el propio GitHub: si hay un run sin terminar que arrancó hace
// menos de ACTIVE_RUN_WINDOW_MS, no se dispara otro. Pasado ese margen el run
// se da por atascado (en cola sin runner, o colgado) y se dispara igual, para
// que el nuevo lo cancele y la cola no vuelva a quedarse bloqueada.
//
// pg_cron dispara directamente desde SQL y no pasa por aquí; como solo lo hace
// cada 5 min, como mucho cancela un sync cada 5 min y no deja la cola sin avanzar.
const ACTIVE_RUN_WINDOW_MS = 4 * 60 * 1000

async function findActiveRun(token: string): Promise<number | null> {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=10`
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const { workflow_runs: runs = [] } = await res.json()
    const now = Date.now()
    for (const run of runs) {
      if (run.status === 'completed') continue
      const startedMs = Math.max(
        new Date(run.created_at).getTime() || 0,
        new Date(run.run_started_at).getTime() || 0,
      )
      if (now - startedMs < ACTIVE_RUN_WINDOW_MS) return run.id
    }
    return null
  } catch {
    // Si no se puede consultar GitHub, mejor sincronizar de más que quedarse sin sync
    return null
  }
}

export async function dispatchLiveSync(inputs: DispatchInputs): Promise<DispatchResult> {
  const token = process.env.GITHUB_DISPATCH_TOKEN
  if (!token) {
    if (process.env.NODE_ENV === 'development') {
      console.log('Falta GITHUB_DISPATCH_TOKEN. Ejecutando script de sincronización localmente en segundo plano...')
      const env = { 
        ...process.env, 
        SYNC_FIXTURE_IDS: inputs.fixture_ids || '', 
        SYNC_MATCHDAY: inputs.matchday || '' 
      }
      
      // Intentar usar sync_venv (para arm64 de Mac) o test_venv si existen, de lo contrario venv
      let pythonPath = '../venv/bin/python'
      if (fs.existsSync(path.resolve(process.cwd(), '../sync_venv/bin/python'))) {
        pythonPath = '../sync_venv/bin/python'
      } else if (fs.existsSync(path.resolve(process.cwd(), '../test_venv/bin/python'))) {
        pythonPath = '../test_venv/bin/python'
      } else {
        // Red de seguridad: si no existen, usar python3 global
        try {
          if (!fs.existsSync(path.resolve(process.cwd(), '../venv/bin/python'))) {
            pythonPath = 'python3'
          }
        } catch (e) {
          pythonPath = 'python3'
        }
      }
      
      console.log(`[dispatchLiveSync] Ejecutando con Python: ${pythonPath}`)
      // Ejecutar en segundo plano, sin esperar (fuego y olvida, igual que GitHub Actions)
      const child = exec(`${pythonPath} ci/run_live_sync.py`, { env })
      child.stdout?.on('data', console.log)
      child.stderr?.on('data', console.error)
      return { dispatched: true }
    }
    throw new Error('Falta GITHUB_DISPATCH_TOKEN en el entorno')
  }

  const activeRunId = await findActiveRun(token)
  if (activeRunId !== null) {
    return { dispatched: false, activeRunId }
  }

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: REF, inputs }),
  })

  // GitHub responde 204 No Content cuando el disparo es correcto.
  if (res.status !== 204) {
    const detail = await res.text()
    // Un token caducado devuelve 401 y, sin este mensaje, en la UI solo se ve
    // "Error al sincronizar": el sync se queda muerto sin que nadie se entere.
    if (res.status === 401) {
      throw new Error('GITHUB_DISPATCH_TOKEN caducado o revocado (401). Genera uno nuevo y actualízalo en Vercel y en .env.local')
    }
    if (res.status === 403) {
      throw new Error('GITHUB_DISPATCH_TOKEN sin permiso para lanzar workflows (403). Necesita Actions = Read and write sobre el repo')
    }
    throw new Error(`GitHub dispatch falló (${res.status}): ${detail}`)
  }

  return { dispatched: true }
}
