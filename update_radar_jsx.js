const fs = require('fs')

let content = fs.readFileSync('frontend-web/src/app/(dashboard)/jugadores/[id]/page.tsx', 'utf-8')

// 1. Add state
const stateHook = "  const [activeBar, setActiveBar] = useState<number | null>(null)\n  const [activeRadarAxis, setActiveRadarAxis] = useState<number | null>(null)"
content = content.replace("  const [activeBar, setActiveBar] = useState<number | null>(null)", stateHook)

// 2. Replace the SVG radar chart part
// Find boundaries
const startTag = '<CardContent className="p-4 flex flex-col items-center">'
const endTag = '{/* Leyenda comparativa con números */}'

const startIndex = content.indexOf(startTag)
const endIndex = content.indexOf(endTag)

const newCode = `<CardContent className="p-4 flex flex-col items-center relative">
              {activeRadarAxis !== null && (
                <div 
                  className="absolute z-10 bg-slate-900/95 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs flex flex-col gap-1 pointer-events-none transition-all duration-150 min-w-[160px]"
                  style={{
                    top: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                  }}
                >
                  <div className="font-bold text-emerald-400 border-b border-slate-700 pb-1 mb-1 text-sm text-center">
                    {playerRadar[activeRadarAxis].label}
                  </div>
                  {playerRadar[activeRadarAxis].metrics.map((m, i) => (
                    <div key={i} className="flex justify-between gap-4">
                      <span className="text-slate-400">{m.label}</span>
                      <span className="font-bold text-slate-100">{m.value}</span>
                    </div>
                  ))}
                  <div className="text-[10px] text-slate-500 italic mt-1 text-center border-t border-slate-800 pt-1">
                    Valor eje: {playerRadar[activeRadarAxis].value}/100
                  </div>
                </div>
              )}

              <div className="w-full flex justify-center py-2">
                <svg width="320" height="280" viewBox="0 0 320 280" className="overflow-visible">
                  {/* Concentric grids at 25, 50, 75, 100 */}
                  {[25, 50, 75, 100].map((pct) => {
                    const d = (pct / 100) * 90
                    const points = radarAngles.map(angle => {
                      return \`\${160 + d * Math.cos(angle)},\${135 + d * Math.sin(angle)}\`
                    }).join(' ')
                    return (
                      <polygon
                        key={pct}
                        points={points}
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="1"
                        strokeDasharray={pct === 100 ? "0" : "2 2"}
                      />
                    )
                  })}

                  {/* Axis lines */}
                  {radarAngles.map((angle, idx) => {
                    const x2 = 160 + 90 * Math.cos(angle)
                    const y2 = 135 + 90 * Math.sin(angle)
                    return (
                      <line
                        key={idx}
                        x1={160}
                        y1={135}
                        x2={x2}
                        y2={y2}
                        stroke="#e2e8f0"
                        strokeWidth="1"
                      />
                    )
                  })}

                  {/* Axis Labels */}
                  {radarAngles.map((angle, idx) => {
                    const d = 110
                    let x = 160 + d * Math.cos(angle)
                    let y = 135 + d * Math.sin(angle)
                    let textAnchor = "middle"
                    if (Math.abs(Math.cos(angle)) > 0.1) {
                      textAnchor = Math.cos(angle) > 0 ? "start" : "end"
                    }
                    if (Math.sin(angle) > 0) y += 5
                    
                    return (
                      <text 
                        key={idx} 
                        x={x} 
                        y={y} 
                        textAnchor={textAnchor} 
                        className="text-[10px] font-bold fill-slate-500 cursor-pointer hover:fill-emerald-600 transition-colors"
                        onMouseEnter={() => setActiveRadarAxis(idx)}
                        onMouseLeave={() => setActiveRadarAxis(null)}
                      >
                        {playerRadar[idx]?.label}
                      </text>
                    )
                  })}

                  {/* Target polygon (P2) */}
                  <polygon
                    points={p2Points}
                    fill="rgba(249, 115, 22, 0.15)"
                    stroke="rgba(249, 115, 22, 0.75)"
                    strokeWidth="2"
                    className="transition-all duration-300"
                  />

                  {/* Player polygon (P1) */}
                  <polygon
                    points={p1Points}
                    fill="rgba(16, 185, 129, 0.25)"
                    stroke="rgba(16, 185, 129, 0.85)"
                    strokeWidth="2.5"
                    className="transition-all duration-300 pointer-events-none"
                  />

                  {/* Vertex circles for P2 */}
                  {p2Values.map((val, idx) => {
                    const angle = radarAngles[idx]
                    const d = (val / 100) * 90
                    const x = 160 + d * Math.cos(angle)
                    const y = 135 + d * Math.sin(angle)
                    return (
                      <circle
                        key={\`p2-\${idx}\`}
                        cx={x}
                        cy={y}
                        r="3"
                        className="fill-orange-500 stroke-white stroke-[1.5]"
                      />
                    )
                  })}

                  {/* Vertex circles for P1 (Interactive) */}
                  {p1Values.map((val, idx) => {
                    const angle = radarAngles[idx]
                    const d = (val / 100) * 90
                    const x = 160 + d * Math.cos(angle)
                    const y = 135 + d * Math.sin(angle)
                    return (
                      <circle
                        key={\`p1-\${idx}\`}
                        cx={x}
                        cy={y}
                        r="5"
                        className="fill-emerald-500 stroke-white stroke-[2] cursor-pointer hover:r-6 transition-all"
                        onMouseEnter={() => setActiveRadarAxis(idx)}
                        onMouseLeave={() => setActiveRadarAxis(null)}
                      />
                    )
                  })}
                </svg>
              </div>

              `

content = content.substring(0, startIndex) + newCode + content.substring(endIndex)

// 3. Update the legend
const legendStartTag = '{/* Leyenda comparativa con números */}'
const legendEndTag = '            </CardContent>'

const legStartIndex = content.indexOf(legendStartTag)
const legEndIndex = content.indexOf(legendEndTag)

const newLegend = `{/* Leyenda comparativa con números */}
              <div className="w-full grid grid-cols-2 gap-4 border-t border-slate-100 pt-3 mt-1 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-600">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="truncate max-w-[120px]">{player.short_name || player.first_name}</span>
                  </div>
                  <div className="pl-3.5 text-slate-500 space-y-0.5 font-medium">
                    {playerRadar.map((axis, i) => (
                      <div key={i} className="flex justify-between gap-1">
                        <span className="truncate">{axis.label}:</span> 
                        <span className="font-bold text-slate-700 tabular-nums shrink-0">{axis.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-orange-600">
                    <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                    <span className="truncate max-w-[120px]">{compareLabel}</span>
                  </div>
                  <div className="pl-3.5 text-slate-500 space-y-0.5 font-medium">
                    {compareRadar.map((axis, i) => (
                      <div key={i} className="flex justify-between gap-1">
                        <span className="truncate">{axis.label}:</span> 
                        <span className="font-bold text-slate-700 tabular-nums shrink-0">{axis.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
`

content = content.substring(0, legStartIndex) + newLegend + content.substring(legEndIndex)

fs.writeFileSync('frontend-web/src/app/(dashboard)/jugadores/[id]/page.tsx', content)
console.log("JSX updated")
