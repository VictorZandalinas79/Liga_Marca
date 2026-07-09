import re

file_path = "/Users/imac/Programas/LFM Vilafranca/frontend-web/src/app/(dashboard)/jugadores/page.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update imports
content = content.replace(
    "import { Search, TrendingUp, Goal, Ticket, Download, Swords, ChevronDown, ChevronUp } from 'lucide-react'",
    "import { Search, TrendingUp, Goal, Ticket, Download, Swords, ChevronDown, ChevronUp, LayoutGrid, List, Map } from 'lucide-react'"
)

# 2. Add viewMode state
content = content.replace(
    "const [filter, setFilter] = useState('')",
    "const [filter, setFilter] = useState('')\n  const [viewMode, setViewMode] = useState<'pitch' | 'cards' | 'list'>('pitch')"
)

# 3. Add view toggle buttons
view_toggles = """            </select>
          </div>
          <div className="mt-4 flex gap-2 justify-center md:justify-start flex-wrap">
            <button onClick={() => setViewMode('pitch')} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${viewMode === 'pitch' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}><Map className="w-4 h-4" /> Campograma</button>
            <button onClick={() => setViewMode('cards')} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${viewMode === 'cards' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}><LayoutGrid className="w-4 h-4" /> Fichas</button>
            <button onClick={() => setViewMode('list')} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${viewMode === 'list' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}><List className="w-4 h-4" /> Lista</button>
          </div>
        </CardContent>"""

content = content.replace("""            </select>
          </div>
        </CardContent>""", view_toggles)


# 4. Replace the old render list
old_list_regex = re.compile(r"\{\/\* Lista de jugadores \*\/\}.*?(?=\{\s*filteredPlayers\.length === 0)", re.DOTALL)

new_views = """{/* Vistas de Jugadores */}
      <div className="w-full">
        {/* VISTA CAMPOGRAMA */}
        {viewMode === 'pitch' && (
          <div className="w-full bg-green-800/90 rounded-2xl border-4 border-white/20 p-2 sm:p-4 md:p-8 relative min-h-[700px] shadow-2xl overflow-hidden flex flex-col-reverse md:flex-row gap-2 md:gap-4" style={{ backgroundImage: 'radial-gradient(circle at center, rgba(255,255,255,0.1) 0%, transparent 60%), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '100% 100%, 30px 30px, 30px 30px' }}>
            {/* Líneas del campo para efecto */}
            <div className="absolute top-1/2 left-0 right-0 h-1 bg-white/30 -translate-y-1/2 md:top-0 md:bottom-0 md:left-1/2 md:right-auto md:w-1 md:h-full md:-translate-x-1/2 shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 md:w-48 md:h-48 rounded-full border-4 border-white/30 shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white/50" />
            
            {/* Áreas de penalti */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 h-24 md:h-auto md:w-32 md:top-1/2 md:-translate-y-1/2 md:left-0 border-t-2 md:border-t-0 md:border-r-2 md:border-y-2 border-white/20 md:-translate-x-0 w-48" />
            <div className="absolute left-1/2 -translate-x-1/2 top-0 h-24 md:h-auto md:w-32 md:top-1/2 md:-translate-y-1/2 md:right-0 border-b-2 md:border-b-0 md:border-l-2 md:border-y-2 border-white/20 md:-translate-x-0 w-48" />

            {['GK', 'DEF', 'MID', 'FWD'].map((posCode) => {
              const playersInPos = filteredPlayers.filter(p => getPositionCode(p.position) === posCode)
              return (
                <div key={posCode} className="flex-1 flex flex-wrap justify-center content-center gap-x-2 gap-y-4 md:gap-4 relative z-10 py-4">
                  {playersInPos.map(player => (
                    <div 
                      key={player.id} 
                      onClick={() => router.push(`/jugadores/${player.id}`)}
                      className="flex flex-col items-center cursor-pointer group hover:scale-110 transition-transform w-[60px] md:w-[80px]"
                      title={`${player.short_name || player.first_name} - ${player.precio ? player.precio + 'M' : '0M'} - ${player.stats?.total_points || 0} pts`}
                    >
                      <div className="relative">
                        {player.photo ? (
                          <img src={player.photo} className="w-12 h-12 md:w-16 md:h-16 rounded-full object-cover border-2 md:border-4 border-white bg-slate-800 shadow-xl" alt={player.short_name || ''} />
                        ) : (
                          <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-slate-800 flex items-center justify-center text-lg md:text-xl font-black text-white border-2 md:border-4 border-white shadow-xl">
                            {player.shirt_number || '?'}
                          </div>
                        )}
                        <div className={`absolute -bottom-2 -right-2 text-[9px] md:text-xs font-black text-white px-1.5 py-0.5 rounded-full border border-white/30 shadow-md ${getPositionColor(player.position)}`}>
                          {player.stats?.total_points ? Math.round(player.stats.total_points * 10) / 10 : 0}
                        </div>
                      </div>
                      <div className="mt-2.5 bg-slate-950/80 border border-white/10 px-1.5 py-0.5 rounded text-[9px] md:text-[11px] font-bold text-white w-full truncate text-center backdrop-blur-sm shadow-md">
                        {player.short_name || player.first_name}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {/* VISTA FICHAS (Grid) */}
        {viewMode === 'cards' && (
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {filteredPlayers.map((player) => (
              <Card key={player.id} onClick={() => router.push(`/jugadores/${player.id}`)} className="cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all !bg-slate-800 border-slate-700 hover:border-emerald-500 overflow-hidden group">
                <div className="h-16 relative bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700">
                  {player.team?.logo_url && (
                    <img src={player.team.logo_url} className="absolute top-2 right-2 w-12 h-12 object-contain opacity-40 group-hover:opacity-100 transition-opacity" alt="" />
                  )}
                  <span className={`absolute top-2 left-2 text-[10px] font-bold uppercase px-2 py-1 rounded shadow-sm ${getPositionColor(player.position)}`}>
                    {getPositionLabel(player.position)}
                  </span>
                </div>
                <div className="p-4 flex flex-col items-center -mt-10 relative">
                  <div className="relative mb-3 group-hover:scale-105 transition-transform">
                    {player.photo ? (
                      <img src={player.photo} className="w-20 h-20 rounded-full object-cover border-4 border-slate-800 bg-slate-900 shadow-lg" alt="" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center text-3xl font-black text-slate-400 border-4 border-slate-800 shadow-lg">
                        {player.shirt_number || '?'}
                      </div>
                    )}
                    {player.shirt_number && (
                      <span className="absolute -bottom-1 -right-1 w-7 h-7 bg-slate-950 text-white text-xs font-black flex items-center justify-center rounded-full border-2 border-slate-700 shadow-md">
                        {player.shirt_number}
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-white text-lg text-center truncate w-full group-hover:text-emerald-400 transition-colors">{player.short_name || `${player.first_name} ${player.last_name}`}</h3>
                  <p className="text-xs text-slate-400 mb-4 truncate w-full text-center">{player.team?.name || 'Sin equipo'}</p>
                  
                  <div className="grid grid-cols-3 w-full gap-1 text-center border-t border-slate-700/50 pt-3">
                    <div className="bg-slate-900/50 rounded py-1.5">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Precio</p>
                      <p className="font-black text-emerald-400 text-sm">{player.precio ? `${player.precio}M` : '-'}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded py-1.5 border-x border-slate-700/30">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Puntos</p>
                      <p className="font-black text-white text-sm">{player.stats ? Math.round(player.stats.total_points * 10) / 10 : 0}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded py-1.5">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Media</p>
                      <p className="font-black text-slate-300 text-sm">{player.stats?.avg_points || 0}</p>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* VISTA LISTA (Tabla compacta) */}
        {viewMode === 'list' && (
          <Card className="!bg-slate-800 border-slate-700 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300 whitespace-nowrap">
                <thead className="text-xs text-slate-400 uppercase bg-slate-900/80 border-b border-slate-700 font-bold tracking-wider">
                  <tr>
                    <th className="px-4 py-4">Jugador</th>
                    <th className="px-4 py-4 text-center">Pos</th>
                    <th className="px-4 py-4">Equipo</th>
                    <th className="px-4 py-4 text-right">Precio</th>
                    <th className="px-4 py-4 text-right">Puntos</th>
                    <th className="px-4 py-4 text-right">Media</th>
                    <th className="px-4 py-4 text-center">Partidos</th>
                    <th className="px-4 py-4 text-center text-emerald-400">Goles</th>
                    <th className="px-4 py-4 text-center text-blue-400">Asist.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {filteredPlayers.map((player) => (
                    <tr key={player.id} onClick={() => router.push(`/jugadores/${player.id}`)} className="hover:bg-slate-700/50 cursor-pointer transition-colors group">
                      <td className="px-4 py-3 font-medium text-white flex items-center gap-3">
                        <div className="relative">
                          {player.photo ? (
                            <img src={player.photo} className="w-9 h-9 rounded-full object-cover bg-slate-900 shrink-0 border border-slate-600" alt="" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0 border border-slate-600">
                              {player.shirt_number || '?'}
                            </div>
                          )}
                          {player.team?.logo_url && (
                            <img src={player.team.logo_url} className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full p-0.5 object-contain" alt="" />
                          )}
                        </div>
                        <span className="truncate max-w-[150px] sm:max-w-[250px] group-hover:text-emerald-400 transition-colors">{player.short_name || `${player.first_name} ${player.last_name}`}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center min-w-[3rem] px-2 py-0.5 rounded text-[10px] font-bold ${getPositionColor(player.position)}`}>
                          {getPositionLabel(player.position)}
                        </span>
                      </td>
                      <td className="px-4 py-3 truncate max-w-[150px] text-slate-400">{player.team?.name || '-'}</td>
                      <td className="px-4 py-3 text-right font-black text-emerald-400">{player.precio ? `${player.precio}M` : '-'}</td>
                      <td className="px-4 py-3 text-right font-black text-white">{player.stats ? Math.round(player.stats.total_points * 10) / 10 : 0}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-300">{player.stats?.avg_points || 0}</td>
                      <td className="px-4 py-3 text-center text-slate-400">{player.stats?.matches_played || 0}</td>
                      <td className="px-4 py-3 text-center font-bold text-emerald-400">{player.stats?.goals || 0}</td>
                      <td className="px-4 py-3 text-center font-bold text-blue-400">{player.stats?.assists || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
"""

content = old_list_regex.sub(new_views, content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Update completed.")
