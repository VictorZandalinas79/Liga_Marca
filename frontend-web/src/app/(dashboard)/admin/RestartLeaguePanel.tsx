'use client'

import { useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'

export function RestartLeaguePanel() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleRestart = async () => {
    if (!window.confirm('¿Estás SEGURO de que quieres borrar todos los puntos, las sanciones y el histórico de pagos? Esta acción NO se puede deshacer.')) {
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/admin/restart-league', {
        method: 'POST',
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || 'Error al reiniciar la liga')
      }
      setSuccess('Liga reiniciada correctamente. Todos los puntos, sanciones y pagos por jornada han sido puestos a 0.')
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
          Borrará todos los puntos de los jugadores en la base de datos, todas las sanciones aplicadas y pondrá a 0 los pagos por jornada.
          Las plantillas, divisiones y cuotas iniciales se mantendrán intactas.
          </p>
        </div>
      </div>

      <div className="bg-red-50 p-4 rounded-xl border border-red-200">
        <p className="text-sm text-red-800 font-medium mb-4">
          Esta acción es <strong>irreversible</strong>. Utilízala si quieres poner a cero las clasificaciones y volver a empezar desde cero o desde una jornada posterior.
        </p>

        {error && <div className="mb-4 text-sm font-semibold text-red-600">{error}</div>}
        {success && <div className="mb-4 text-sm font-semibold text-emerald-600">{success}</div>}

        <div className="flex items-center gap-3">
          <button
            onClick={handleRestart}
            disabled={loading}
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
