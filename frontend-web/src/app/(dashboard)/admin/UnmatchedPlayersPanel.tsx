'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, UserX, RefreshCw } from 'lucide-react'

type UnmatchedPlayer = {
  id: string
  player_name: string
  team_name: string
  message: string
  created_at: string
}

export function UnmatchedPlayersPanel() {
  const [players, setPlayers] = useState<UnmatchedPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadPlayers = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/unmatched-players')
      if (!res.ok) {
        throw new Error('Error al cargar jugadores no emparejados')
      }
      const data = await res.json()
      setPlayers(data.players || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPlayers()
  }, [])

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-6">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <UserX className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Jugadores sin emparejar</h2>
            <p className="text-sm text-slate-500">
              Jugadores de Biwenger que no se encontraron en la API (se quedaron fuera de la base de datos).
            </p>
          </div>
        </div>
        <button
          onClick={loadPlayers}
          disabled={loading}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
          title="Actualizar lista"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border-b border-red-100 flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-5 py-3 font-semibold">Jugador</th>
              <th className="px-5 py-3 font-semibold">Equipo</th>
              <th className="px-5 py-3 font-semibold">Detalles</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-slate-400">
                  Cargando...
                </td>
              </tr>
            ) : players.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-slate-400">
                  ¡Genial! Todos los jugadores de Biwenger se emparejaron correctamente con la API.
                </td>
              </tr>
            ) : (
              players.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50">
                  <td className="px-5 py-4 font-medium text-slate-900">{p.player_name}</td>
                  <td className="px-5 py-4 text-slate-600">{p.team_name}</td>
                  <td className="px-5 py-4 text-slate-500 text-xs">{p.message}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
