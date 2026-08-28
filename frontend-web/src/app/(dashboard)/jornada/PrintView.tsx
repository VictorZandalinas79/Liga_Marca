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

  // El grid se adapta al número de equipos (una liga puede tener desde 10 hasta
  // más de 24) para seguir cabiendo en una única hoja A4 apaisada sin que se
  // corte contenido: cuantos más equipos, más columnas y más compacta la carta.
  const n = teams.length
  const cols = n <= 10 ? 4 : n <= 15 ? 5 : n <= 21 ? 6 : n <= 28 ? 7 : 8
  const dense = n > 21
  const ultraDense = n > 28

  const rankBadge = (pos?: number) => {
    if (pos === 1) return '🥇'
    if (pos === 2) return '🥈'
    if (pos === 3) return '🥉'
    return pos ? `#${pos}` : ''
  }

  return (
    <div id="pdf-content" className="hidden print:flex print:flex-col bg-slate-50 w-[297mm] h-[210mm] overflow-hidden">
      {/* Header: escudo de la liga + título con degradado */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-900">
        <img src="/icono_lliga.png" alt="" className="w-7 h-7 rounded-full object-cover border border-white/40 shadow shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="text-[13px] font-black text-white tracking-tight leading-none uppercase">
            Jornada {matchday}
            {division ? <span className="text-emerald-400"> · {division}ª División</span> : ''}
          </h1>
          <p className="text-[7px] font-bold text-slate-400 uppercase tracking-[0.15em] leading-none mt-0.5">Liga Fantasy Vilafranca</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[6px] font-bold text-slate-500 uppercase tracking-wider leading-none">Equipos</p>
          <p className="text-[11px] font-black text-white leading-none">{n}</p>
        </div>
      </div>

      {/* Grid de Equipos, densidad dinámica */}
      <div
        className="flex-1 grid gap-1 p-1.5 min-h-0"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: '1fr' }}
      >
        {teams.map((t) => (
          <div key={t.team_id} className="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden break-inside-avoid flex flex-col">
            {/* User Header */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-1 py-[1.5px] flex justify-between items-center gap-1 shrink-0">
              <span className="text-[6px] font-black text-slate-400 shrink-0 w-4 text-center leading-none">
                {rankBadge(t.posicion)}
              </span>
              <h3 className="font-bold text-[7px] truncate uppercase tracking-wide flex-1 min-w-0 leading-none">{t.user_name}</h3>
              <div className="shrink-0 flex items-baseline gap-0.5">
                <span className="text-[9px] font-black text-emerald-400 leading-none">{Math.round((t.puntos_totales ?? 0) * 10) / 10}</span>
                <span className="text-[4.5px] text-slate-400 font-bold leading-none">PTS</span>
              </div>
            </div>

            {/* Players List */}
            <div className="flex-1 flex flex-col justify-between">
              {t.jugadores.slice(0, 11).map((player, idx) => {
                const isPenalized = !!player.sanctionReason

                return (
                  <div key={`${t.team_id}-${player.id}-${idx}`} className="flex items-center gap-[2px] px-[2px] bg-white border-b border-slate-100/60 last:border-0 overflow-hidden">
                    {/* Escudo del equipo real del jugador */}
                    <div className="shrink-0 w-2.5 flex justify-center">
                      {player.team?.logo_url ? (
                        <img src={player.team.logo_url} alt="" className="w-2.5 h-2.5 object-contain" title={player.team?.name} />
                      ) : (
                        <span className="text-[4px] text-slate-300 font-black">{player.shirt_number || '-'}</span>
                      )}
                    </div>

                    {/* Foto ultracompacta */}
                    {!ultraDense && (
                      <div className="shrink-0 relative">
                        {player.photo ? (
                          <img src={player.photo} alt="" className="w-3 h-3 rounded-full object-cover border border-white shadow-sm bg-slate-200" />
                        ) : (
                          <div className="w-3 h-3 rounded-full bg-slate-200 flex items-center justify-center text-[4.5px] font-bold text-slate-500 shadow-sm border border-white">
                            ?
                          </div>
                        )}
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0 leading-none">
                      <div className="flex items-center gap-0.5">
                        <span className={`text-[5.5px] font-bold truncate ${isPenalized ? 'text-red-700 line-through' : 'text-slate-800'}`}>
                          {player.short_name || player.first_name}
                        </span>
                        {player.is_captain && (
                          <span className="bg-yellow-500 text-white text-[4px] font-bold px-[2px] rounded-sm leading-none shrink-0">C</span>
                        )}
                        {!dense && (
                          <span className={`text-[3.5px] font-bold text-white px-[2px] rounded-sm leading-none shrink-0 ${getPositionColor(player.position)}`}>
                            {getPositionLabel(player.position)}
                          </span>
                        )}
                      </div>

                      {/* Sustitución ultracompacta */}
                      {!dense && player.replacedPlayer && (
                        <div className="flex items-center mt-[0.5px]">
                          <span className="text-[4.5px] text-slate-400 font-medium scale-90 origin-left">⇆ </span>
                          <span className="text-[4.5px] font-bold text-emerald-600 truncate scale-90 origin-left">
                            {player.replacedPlayer.short_name || player.replacedPlayer.first_name}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Puntos */}
                    <div className="shrink-0 text-right pr-0.5">
                      {isPenalized ? (
                        <span className="text-[5.5px] font-black text-red-600">0</span>
                      ) : (
                        <span className="text-[6px] font-black text-emerald-600">
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
              <div className="bg-red-50 px-0.5 py-[0.5px] border-t border-red-100 text-[4.5px] font-bold text-red-600 text-center uppercase tracking-wider shrink-0">
                Alineación Sancionada
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
