'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'

export function RestartLeaguePanel() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [startingMatchday, setStartingMatchday] = useState('1')
  const [password, setPassword] = useState('')

  // Arranca con la jornada de inicio que ya está configurada.
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/league-config')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        const md = data?.config?.fantasy_starting_matchday
        if (!cancelled && md != null) setStartingMatchday(String(md))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const handleRestart = async () => {
    const md = Number(startingMatchday)
    if (!Number.isInteger(md) || md < 1 || md > 38) {
      setError('Indica una jornada de inicio válida (1-38)')
      return
    }

    if (!password) {
      setError('Escribe tu contraseña para confirmar')
      return
    }

    if (!window.confirm(
      `¿Estás SEGURO?\n\nSe pondrán a 0 los puntos de los usuarios, todos los rankings, las sanciones y el saldo, y el juego empezará en la J${md}.\n\nNO se borran: los puntos de los jugadores, las plantillas, ni la cuota y el estado de pago de cada usuario.\n\nEsta acción NO se puede deshacer.`
    )) {
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/admin/restart-league', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startingMatchday: md, password }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || 'Error al reiniciar la liga')
      }
      setPassword('')
      setSuccess(`Liga reiniciada correctamente. El juego empieza en la J${md}: puntos de usuarios, rankings, sanciones y saldos a 0.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-red-200 p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-red-700">Zona de Peligro: Reiniciar Liga</h2>
          <p className="text-sm text-slate-500">
            Pone a 0 los puntos de los usuarios, todos los rankings, las sanciones y el saldo,
            y marca la jornada en la que empieza el juego. NO se tocan: los puntos de los jugadores,
            las plantillas, las divisiones ni las columnas <strong>Cuota</strong> y
            <strong>Pagado/Pendiente</strong> de la tabla de usuarios.
          </p>
        </div>
      </div>

      <div className="bg-red-50 p-4 rounded-xl border border-red-200">
        <p className="text-sm text-red-800 font-medium mb-4">
          Esta acción es <strong>irreversible</strong>. Solo cuentan las jornadas a partir de la que indiques:
          este valor sustituye al de <em>&laquo;Jornada en la que empieza el juego&raquo;</em>.
        </p>

        <div className="mb-4 flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-semibold text-red-800 uppercase tracking-wider mb-1">
              Empezar en la jornada
            </label>
            <input
              type="number"
              min={1}
              max={38}
              step={1}
              value={startingMatchday}
              onChange={(e) => setStartingMatchday(e.target.value)}
              disabled={loading}
              className="w-28 px-3 py-2 rounded-xl border border-red-300 bg-white text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50"
            />
          </div>
          <div className="min-w-[220px]">
            <label className="block text-xs font-semibold text-red-800 uppercase tracking-wider mb-1">
              Tu contraseña de admin
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
              placeholder="Confirma con tu contraseña"
              className="w-full px-3 py-2 rounded-xl border border-red-300 bg-white text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50"
            />
          </div>
        </div>

        {error && <div className="mb-4 text-sm font-semibold text-red-600">{error}</div>}
        {success && <div className="mb-4 text-sm font-semibold text-emerald-600">{success}</div>}

        <div className="flex items-center gap-3">
          <button
            onClick={handleRestart}
            disabled={loading || !password}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-semibold transition-colors disabled:opacity-50 bg-red-600 hover:bg-red-700`}
          >
            <Trash2 className="w-4 h-4" />
            {loading ? 'Reiniciando...' : 'Reiniciar Liga'}
          </button>
        </div>
      </div>
    </div>
  )
}
