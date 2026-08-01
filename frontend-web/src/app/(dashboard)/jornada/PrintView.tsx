import React from 'react'

interface Player {
  id: string
  first_name: string
  last_name: string
  short_name: string
  position: string
  photo?: string
  shirt_number?: number
  puntos?: number
  valor?: number
  is_starter?: boolean
  is_captain?: boolean
  team_id?: string
  team?: { name: string; logo_url?: string }
  hasPlayed?: boolean
  hasSubstitutionWarning?: boolean
  hasMaxTeamWarning?: boolean
  replacedPlayer?: { id: string; short_name?: string; first_name?: string; photo?: string } | null
  originalPuntos?: number
  sanctionReason?: string
}

interface UserTeam {
  team_id: string
  user_id: string
  user_name: string
  team_name: string
  created_at: string
  jugadores: Player[]
  puntos_totales: number
  valor_total: number
  posicion?: number
  hasBudgetWarning?: boolean
  hasTacticsWarning?: boolean
}

export function PrintView({ teams, matchday, division }: { teams: UserTeam[], matchday: number, division: number | null }) {
  const getPositionLabel = (pos: string) => {
    switch (pos?.toLowerCase()) {
      case 'goalkeeper': return 'POR'
      case 'defender': return 'DEF'
      case 'midfielder': return 'MED'
      case 'forward': return 'DEL'
      default: return pos
    }
  }

  const getPositionColor = (pos: string) => {
    switch (pos?.toLowerCase()) {
      case 'goalkeeper': return 'bg-amber-500'
      case 'defender': return 'bg-sky-500'
      case 'midfielder': return 'bg-emerald-500'
      case 'forward': return 'bg-rose-500'
      default: return 'bg-slate-500'
    }
  }

  const fmtValor = (v: number) => {
    return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1000).toFixed(0)}K`
  }

  return (
    <div className="hidden print:block bg-slate-50 w-full min-h-screen">
      {/* Header compactado */}
      <div className="flex items-center justify-between border-b-2 border-slate-900 pb-1 mb-2 pt-2 px-4">
        <div>
          <h1 className="text-sm font-black text-slate-900 tracking-tight">ALINEACIONES JORNADA {matchday} {division ? `• DIVISIÓN ${division}` : ''}</h1>
        </div>
        <div className="text-right">
          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">LIGA MARCA FANTASY</p>
        </div>
      </div>

      {/* Grid de Equipos super denso (hasta 5 o 6 columnas) */}
      <div className="grid grid-cols-5 gap-1.5 px-4 pb-4">
        {teams.map((t) => (
          <div key={t.team_id} className="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden break-inside-avoid">
            {/* User Header */}
            <div className="bg-slate-900 text-white p-1 flex justify-between items-center">
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-[8px] truncate uppercase tracking-wide">{t.user_name}</h3>
              </div>
              <div className="text-right shrink-0 ml-1 flex items-baseline gap-0.5">
                <span className="text-[10px] font-black text-emerald-400 leading-none">{Math.round((t.puntos_totales ?? 0) * 10) / 10}</span>
                <span className="text-[5px] text-slate-400 font-bold">PTS</span>
              </div>
            </div>

            {/* Players List */}
            <div className="p-0.5 space-y-[1px]">
              {t.jugadores.slice(0, 11).map((player, idx) => {
                const isPenalized = !!player.sanctionReason

                return (
                  <div key={player.id} className="flex items-center gap-1 p-[1px] rounded bg-slate-50 border border-slate-100/50">
                    {/* Dorsal */}
                    <div className="w-2.5 flex justify-center shrink-0">
                      <span className="text-[5px] font-black text-slate-400">{player.shirt_number || '-'}</span>
                    </div>

                    {/* Foto ultracompacta */}
                    <div className="shrink-0 relative">
                      {player.photo ? (
                        <img src={player.photo} alt="" className="w-3.5 h-3.5 rounded-full object-cover border border-white shadow-sm bg-slate-200" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full bg-slate-200 flex items-center justify-center text-[5px] font-bold text-slate-500 shadow-sm border border-white">
                          ?
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 leading-none">
                      <div className="flex items-center gap-0.5">
                        <span className={`text-[6px] font-bold truncate ${isPenalized ? 'text-red-700 line-through' : 'text-slate-800'}`}>
                          {player.short_name || player.first_name}
                        </span>
                        {player.is_captain && (
                          <span className="bg-yellow-500 text-white text-[4px] font-bold px-[2px] rounded-sm leading-none shrink-0">C</span>
                        )}
                        <span className={`text-[4px] font-bold text-white px-[2px] rounded-sm leading-none shrink-0 ${getPositionColor(player.position)}`}>
                          {getPositionLabel(player.position)}
                        </span>
                      </div>
                      
                      {/* Sustitución ultracompacta */}
                      {player.replacedPlayer && (
                        <div className="flex items-center mt-[1px]">
                          <span className="text-[5px] text-slate-400 font-medium scale-90 origin-left">⇆ </span>
                          <span className="text-[5px] font-bold text-emerald-600 truncate scale-90 origin-left">
                            {player.replacedPlayer.short_name || player.replacedPlayer.first_name}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Puntos */}
                    <div className="shrink-0 text-right pr-0.5">
                      {isPenalized ? (
                        <span className="text-[6px] font-black text-red-600">0</span>
                      ) : (
                        <span className="text-[7px] font-black text-emerald-600">
                          {Math.round((player.puntos ?? 0) * 10) / 10}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            
            {/* Warnings footer si los hay */}
            {(t.hasBudgetWarning || t.hasTacticsWarning) && (
              <div className="bg-red-50 p-0.5 border-t border-red-100 text-[5px] font-bold text-red-600 text-center uppercase tracking-wider">
                Alineación Sancionada
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
