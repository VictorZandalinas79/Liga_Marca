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

import { exec } from 'child_process'

export async function dispatchLiveSync(inputs: DispatchInputs): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN
  if (!token) {
    if (process.env.NODE_ENV === 'development') {
      console.log('Falta GITHUB_DISPATCH_TOKEN. Ejecutando script de sincronización localmente en segundo plano...')
      const env = { 
        ...process.env, 
        SYNC_FIXTURE_IDS: inputs.fixture_ids || '', 
        SYNC_MATCHDAY: inputs.matchday || '' 
      }
      // Ejecutar en segundo plano, sin esperar (fuego y olvida, igual que GitHub Actions)
      const child = exec('python ci/run_live_sync.py', { env })
      child.stdout?.on('data', console.log)
      child.stderr?.on('data', console.error)
      return
    }
    throw new Error('Falta GITHUB_DISPATCH_TOKEN en el entorno')
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
    throw new Error(`GitHub dispatch falló (${res.status}): ${detail}`)
  }
}
