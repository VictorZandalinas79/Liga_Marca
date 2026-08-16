#!/usr/bin/env node
// Comprueba que GITHUB_DISPATCH_TOKEN sirve para lanzar sync-live.yml.
// Un token caducado hace que el botón "Sincronizar" falle en silencio, así que
// conviene pasar esto tras rotarlo (en local y con el valor de Vercel).
//
//   node scripts/check-dispatch-token.mjs             # solo comprueba permisos
//   node scripts/check-dispatch-token.mjs --dispatch  # además lanza un sync real
//
// Lee .env.local / .env de frontend-web, o el token que exportes a mano:
//   GITHUB_DISPATCH_TOKEN=ghp_xxx node scripts/check-dispatch-token.mjs

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Carga mínima de .env: no dependemos de dotenv para poder correr esto suelto.
for (const file of ['.env.local', '.env']) {
  const full = path.join(ROOT, file)
  if (!fs.existsSync(full)) continue
  for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const [, key, rawValue] = m
    if (process.env[key]) continue // lo exportado a mano manda
    process.env[key] = rawValue.replace(/^["']|["']$/g, '')
  }
}

const OWNER = process.env.GITHUB_OWNER || 'VictorZandalinas79'
const REPO = process.env.GITHUB_REPO || 'Liga_Marca'
const REF = process.env.GITHUB_REF || 'main'
const WORKFLOW = 'sync-live.yml'
const token = process.env.GITHUB_DISPATCH_TOKEN

const api = (url, init = {}) =>
  fetch(`https://api.github.com${url}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

const fail = msg => {
  console.error(`\n❌ ${msg}\n`)
  process.exit(1)
}

if (!token) {
  fail(
    'No hay GITHUB_DISPATCH_TOKEN.\n' +
      '   En local sin token, /api/sync-match ejecuta ci/run_live_sync.py con Python en vez de\n' +
      '   lanzar GitHub Actions. Si quieres el mismo camino que producción, añádelo a\n' +
      `   ${path.join(ROOT, '.env.local')}`
  )
}

// Un valor con espacios, comillas o caracteres raros revienta luego dentro de
// fetch con un error ilegible; mejor decirlo aquí.
if (!/^[\x21-\x7e]+$/.test(token)) {
  fail('El valor de GITHUB_DISPATCH_TOKEN tiene espacios o caracteres no válidos. Cópialo otra vez, sin comillas ni saltos de línea.')
}

console.log(`Token: ${token.slice(0, 4)}…${token.slice(-4)} (${token.length} chars)`)
console.log(`Repo:  ${OWNER}/${REPO} @ ${REF}`)

const who = await api('/user')
if (who.status === 401) {
  fail(
    'GitHub responde 401 Bad credentials: el token está caducado o revocado.\n' +
      '   Crea uno nuevo (fine-grained, solo este repo, Actions = Read and write) y actualízalo\n' +
      '   en frontend-web/.env.local, en la raíz .env (lo usa scheduler.py) y en Vercel.'
  )
}
if (!who.ok) fail(`GitHub /user devolvió ${who.status}: ${await who.text()}`)
console.log(`✅ Token válido (cuenta: ${(await who.json()).login})`)

const wf = await api(`/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}`)
if (wf.status === 404) {
  fail(
    `No ve ${WORKFLOW} en ${OWNER}/${REPO} (404).\n` +
      '   El token es válido pero no alcanza este repo: revisa "Repository access" y el permiso Actions.'
  )
}
if (!wf.ok) fail(`No pudo leer el workflow (${wf.status}): ${await wf.text()}`)
console.log(`✅ Ve ${WORKFLOW} (estado: ${(await wf.json()).state})`)

if (!process.argv.includes('--dispatch')) {
  console.log('\nPermisos de lectura OK. Para probar el disparo real: --dispatch')
  process.exit(0)
}

// Solo un dispatch de verdad demuestra que hay permiso de escritura.
const res = await api(`/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
  method: 'POST',
  body: JSON.stringify({ ref: REF, inputs: { fixture_ids: '', matchday: '' } }),
})

if (res.status === 204) {
  console.log('✅ Dispatch aceptado. Mira el run en:')
  console.log(`   https://github.com/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}`)
} else {
  fail(
    `Dispatch rechazado (${res.status}): ${await res.text()}\n` +
      '   403 suele ser falta del permiso Actions = Read and write.'
  )
}
