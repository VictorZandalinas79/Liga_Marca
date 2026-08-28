'use client'

import { useEffect, useState } from 'react'
import { Trophy, Save, Check, Info } from 'lucide-react'
import {
  type ScoringRules,
  POSITIONS,
  POSITION_LABELS,
  EDITABLE_EVENTS,
  num,
  type Position
} from '@/lib/scoring-config'

export function ScoringConfigPanel({ onStateChange }: { onStateChange?: (state: any) => void }) {
  const [rules, setRules] = useState<ScoringRules | null>(null)
  const [savedRules, setSavedRules] = useState<ScoringRules | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<Position>('POR')

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/admin/scoring-config')
        if (res.ok) {
          const body = await res.json()
          setRules(body.rules ?? null)
          setSavedRules(body.rules ?? null)
          if (!body.rules) setError('No hay configuración guardada. Aplica la migración 008_scoring_config.sql en Supabase.')
        } else {
          const b = await res.json().catch(() => ({}))
          setError(b.error || 'No se pudo cargar la configuración')
        }
      } catch {
        setError('No se pudo cargar la configuración')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Actualiza un valor anidado del clon de reglas (events / penalties_per_X).
  const setEventValue = (key: string, valueKey: string, raw: string) => {
    const value = raw === '' || raw === '-' ? 0 : Number(raw)
    setRules((r) => {
      if (!r) return r
      const next = JSON.parse(JSON.stringify(r)) as ScoringRules
      const events = (next.events ??= {}) as Record<string, Record<string, unknown>>
      events[key] ??= {}
      events[key][valueKey] = value
      return next
    })
  }

  // Actualiza un valor de participación.
  const setParticipationValue = (key: string, raw: string) => {
    const value = raw === '' || raw === '-' ? 0 : Number(raw)
    setRules((r) => {
      if (!r) return r
      const next = JSON.parse(JSON.stringify(r)) as ScoringRules
      const part = (next.participation ??= {}) as Record<string, unknown>
      part[key] = value
      return next
    })
  }

  // Actualiza un límite de Relevo (relevo_limits -> pos -> key).
  const setRelevoLimit = (pos: Position, key: string, raw: string) => {
    const value = raw === '' || raw === '-' ? 0 : Number(raw)
    setRules((r) => {
      if (!r) return r
      const next = JSON.parse(JSON.stringify(r)) as ScoringRules
      const limits = (next.relevo_limits ??= {}) as Record<string, Record<string, unknown>>
      const posLimits = (limits[pos] ??= {}) as Record<string, unknown>
      posLimits[key] = value
      return next
    })
  }

  const setPenaltyValue =(group: string, pos: string, raw: string) => {
    const value = raw === '' || raw === '-' ? 0 : Number(raw)
    setRules((r) => {
      if (!r) return r
      const next = JSON.parse(JSON.stringify(r)) as ScoringRules
      const penalties = (next.penalties_per_X ??= {}) as Record<string, Record<string, Record<string, unknown>>>
      const grp = (penalties[group] ??= {})
      const target = (grp[pos] ??= { required: 1 })
      target.points = value
      return next
    })
  }

  const save = async () => {
    if (!rules) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      // Sólo enviamos las secciones editables; el servidor hace merge y preserva metadatos.
      const res = await fetch('/api/admin/scoring-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: rules.events,
          participation: rules.participation,
          penalties_per_X: rules.penalties_per_X,
          relevo_limits: rules.relevo_limits,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || 'No se pudo guardar')
      }
      const body = await res.json()
      if (body.rules) {
        setRules(body.rules)
        setSavedRules(body.rules)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
      throw e
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!onStateChange) return
    if (!rules || !savedRules) {
      onStateChange({ hasChanges: false, description: [], save: async () => {}, discard: () => {} })
      return
    }

    const diffs: string[] = []

    // 1. Participacion
    const partKeys = ['starter_bonus', 'substitute_bonus', 'win_bonus_60', 'draw_bonus_60']
    const partLabels: Record<string, string> = {
      starter_bonus: 'Bono Titular',
      substitute_bonus: 'Bono Titular-Suplente (< 60 min)',
      win_bonus_60: 'Victoria (>=60 min)',
      draw_bonus_60: 'Empate (>=60 min)'
    }
    partKeys.forEach(k => {
      const original = (savedRules.participation as any)?.[k] ?? 0
      const current = (rules.participation as any)?.[k] ?? 0
      if (original !== current) {
        diffs.push(`${partLabels[k] || k}: ${original} ➔ ${current}`)
      }
    })

    // 2. Eventos posicionales y unicos
    const eventsObj = (rules.events ?? {}) as Record<string, Record<string, unknown>>
    const savedEventsObj = (savedRules.events ?? {}) as Record<string, Record<string, unknown>>
    
    EDITABLE_EVENTS.forEach(e => {
      if (e.kind === 'positional') {
        POSITIONS.forEach(pos => {
          const original = savedEventsObj[e.key]?.[pos] ?? 0
          const current = eventsObj[e.key]?.[pos] ?? 0
          if (original !== current) {
            diffs.push(`${e.label} (${POSITION_LABELS[pos]}): ${original} ➔ ${current}`)
          }
        })
      } else {
        const original = savedEventsObj[e.key]?.all ?? savedEventsObj[e.key]?.value ?? 0
        const current = eventsObj[e.key]?.all ?? eventsObj[e.key]?.value ?? 0
        if (original !== current) {
          diffs.push(`${e.label}: ${original} ➔ ${current}`)
        }
      }
    })

    // 3. Relevo Limits
    POSITIONS.forEach(pos => {
      const origPos = (savedRules.relevo_limits as any)?.[pos] || {}
      const currPos = (rules.relevo_limits as any)?.[pos] || {}
      const keys = Array.from(new Set([...Object.keys(origPos), ...Object.keys(currPos)]))
      keys.forEach(k => {
        if (origPos[k] !== currPos[k]) {
          diffs.push(`Límite Relevo ${POSITION_LABELS[pos]} (${k}): ${origPos[k] ?? 0} ➔ ${currPos[k] ?? 0}`)
        }
      })
    })

    onStateChange({
      hasChanges: diffs.length > 0,
      description: diffs.map(d => `Puntuación: ${d}`),
      save: save,
      discard: () => setRules(savedRules)
    })
  }, [rules, savedRules, onStateChange])

  const events = (rules?.events ?? {}) as Record<string, Record<string, unknown>>

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <Trophy className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Sistema de Puntuación</h2>
          <p className="text-sm text-slate-500">Puntos por evento, bonus por métrica y penalizaciones</p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>Los cambios se aplican en las próximas sincronizaciones de partidos. Re-sincroniza para recalcular los puntos ya almacenados.</span>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm py-6 text-center">Cargando configuración…</p>
      ) : !rules ? (
        <p className="text-red-600 text-sm py-4">{error}</p>
      ) : (
        <>
          {/* Participación y Resultado */}
          <section className="space-y-3">
            <p className="text-sm font-semibold text-slate-700">Participación y Resultado</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <LabeledInput
                label="Bono Titular-Suplente (< 60 min)"
                value={num(rules.participation, 'substitute_bonus')}
                onChange={(v) => setParticipationValue('substitute_bonus', v)}
              />
              <LabeledInput
                label="Bono Titular (≥ 60 min)"
                value={num(rules.participation, 'starter_bonus')}
                onChange={(v) => setParticipationValue('starter_bonus', v)}
              />
              <LabeledInput
                label="Victoria (jugando ≥ 60 min)"
                value={num(rules.participation, 'win_bonus_60') || 0}
                onChange={(v) => setParticipationValue('win_bonus_60', v)}
              />
              <LabeledInput
                label="Empate (jugando ≥ 60 min)"
                value={num(rules.participation, 'draw_bonus_60') || 0}
                onChange={(v) => setParticipationValue('draw_bonus_60', v)}
              />
            </div>
            <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg flex gap-3 text-sm text-blue-800 items-start mt-2">
              <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-600" />
              <div>
                <strong>Nota sobre resultado:</strong> Los bonos por victoria y empate se basan en el resultado final del partido y solo se otorgan a jugadores que hayan disputado al menos el umbral configurado (normalmente 60 min).
              </div>
            </div>
          </section>

          {/* Eventos posicionales */}
          <section className="space-y-4">
            <p className="text-sm font-semibold text-slate-700">Eventos por posición</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-separate border-spacing-y-1">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-400">
                    <th className="text-left font-semibold px-2 py-1">Evento</th>
                    {POSITIONS.map((p) => (
                      <th key={p} className="font-semibold px-2 py-1 text-center w-24">{POSITION_LABELS[p]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {EDITABLE_EVENTS.filter((e) => e.kind === 'positional').map((e) => (
                    <tr key={e.key}>
                      <td className="px-2 py-1 font-medium text-slate-700">{e.label}</td>
                      {POSITIONS.map((p) => (
                        <td key={p} className="px-2 py-1">
                          <NumberInput
                            value={num(events[e.key], p)}
                            onChange={(v) => setEventValue(e.key, p, v)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg flex gap-3 text-sm text-blue-800 items-start mt-2">
              <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-600" />
              <div>
                <strong>Nota sobre "Gol encajado":</strong> Si a un equipo le marcan solo 1 gol, no penaliza (0 puntos). Si le marcan 2 o más goles, se multiplica la cantidad total de goles por la penalización que configures. 
                <br/><em>Ejemplo: Si configuras Defensa a -1 y le marcan 2 goles, el defensa restará -2 puntos.</em>
              </div>
            </div>
          </section>

          {/* Eventos de valor único */}
          <section className="space-y-3">
            <p className="text-sm font-semibold text-slate-700">Eventos (valor único)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {EDITABLE_EVENTS.filter((e) => e.kind === 'single').map((e) => (
                <LabeledInput
                  key={e.key}
                  label={e.label}
                  value={num(events[e.key], 'all')}
                  onChange={(v) => setEventValue(e.key, 'all', v)}
                />
              ))}
            </div>
          </section>

          {/* RELEVO Rules */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Puntos RELEVO (Límites por posición)</p>
            </div>
            
            <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
              {POSITIONS.map((p) => (
                <button
                  key={p}
                  onClick={() => setActiveTab(p)}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                    activeTab === p ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {POSITION_LABELS[p]}
                </button>
              ))}
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              {activeTab === 'POR' && (
                <div className="space-y-6">
                  <div className="border border-slate-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-slate-800 text-sm mb-3">Bloque 1 (1 punto) - Condición OR</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <LabeledInput label="Pases completados / min jugados" value={num((rules.relevo_limits as any)?.POR || {}, 'pass_completed_per_min') || 0.18} onChange={(v) => setRelevoLimit('POR', 'pass_completed_per_min', v)} step="0.01" />
                      <LabeledInput label="Paradas / min jugados" value={num((rules.relevo_limits as any)?.POR || {}, 'saves_per_min') || 0.01} onChange={(v) => setRelevoLimit('POR', 'saves_per_min', v)} step="0.01" />
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-slate-800 text-sm mb-3">Bloque 2 (1 punto) - Calidad de Parada o Pases Largos</h4>
                    <p className="text-xs text-slate-500 mb-3">
                      Se busca un tiro rival en los 5 segundos previos a cada parada. Ese tiro recibe un <strong>Valor de Importancia</strong> según su zona (ver mapa).
                      Se suma ese valor en cada parada; el acumulado debe superar una fracción del número de paradas realizadas, o alternativamente basta con el ritmo de pases largos.
                    </p>
                    <div className="flex flex-col lg:flex-row gap-5 items-start">
                      <div className="flex-1 w-full max-w-sm border border-slate-200 rounded-lg overflow-hidden bg-slate-100">
                        <img src="/calidad_parada.png" alt="Mapa de puntos por Calidad de Parada" className="w-full h-auto object-cover" />
                      </div>
                      <div className="flex-1 w-full grid grid-cols-1 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <LabeledInput label="Divisor de paradas (ej. 3 = un tercio)" value={num((rules.relevo_limits as any)?.POR || {}, 'calidad_parada_divisor') || 3.0} onChange={(v) => setRelevoLimit('POR', 'calidad_parada_divisor', v)} step="1" />
                      </div>
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-slate-800 text-sm mb-3">Bloque 3 (1 punto) - Condición OR</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <LabeledInput label="Pases largos completados (por partido)" value={num((rules.relevo_limits as any)?.POR || {}, 'long_passes_flat') || 6} onChange={(v) => setRelevoLimit('POR', 'long_passes_flat', v)} step="1" />
                      <LabeledInput label="(Blocajes + puños) / min jugados" value={num((rules.relevo_limits as any)?.POR || {}, 'block_punch_per_min') || 0.02} onChange={(v) => setRelevoLimit('POR', 'block_punch_per_min', v)} step="0.01" />
                      <LabeledInput label="(Salidas + cubrir balón) / min jugados" value={num((rules.relevo_limits as any)?.POR || {}, 'sweeper_cover_per_min') || 0.02} onChange={(v) => setRelevoLimit('POR', 'sweeper_cover_per_min', v)} step="0.01" />
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-slate-800 text-sm mb-3">Bloque 4 (1 punto) - Condición OR</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <LabeledInput label="Paradas de calidad ≥ 0.7 (mín. nº)" value={num((rules.relevo_limits as any)?.POR || {}, 'saves_gte_07_count') || 2} onChange={(v) => setRelevoLimit('POR', 'saves_gte_07_count', v)} step="1" />
                      <LabeledInput label="Paradas / min jugados (con portería a cero y mín. 2 paradas)" value={num((rules.relevo_limits as any)?.POR || {}, 'saves_per_min_b4') || 0.03} onChange={(v) => setRelevoLimit('POR', 'saves_per_min_b4', v)} step="0.01" />
                      <LabeledInput label="Goles (mín.)" value={num((rules.relevo_limits as any)?.POR || {}, 'goals_count') || 1} onChange={(v) => setRelevoLimit('POR', 'goals_count', v)} step="1" />
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'DEF' && (
                <div className="space-y-6">
                  <div className="border border-slate-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-slate-800 text-sm mb-3">Bloque 1 (1 punto) - Condición OR</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <LabeledInput label="Acciones defensivas / min jugados" value={num((rules.relevo_limits as any)?.DEF || {}, 'def_actions_per_min') || 0.07} onChange={(v) => setRelevoLimit('DEF', 'def_actions_per_min', v)} step="0.01" />
                      <LabeledInput label="% Pases buenos" value={num((rules.relevo_limits as any)?.DEF || {}, 'pass_pct') || 70} onChange={(v) => setRelevoLimit('DEF', 'pass_pct', v)} step="1" />
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-slate-800 text-sm mb-3">Bloque 2 (1 punto) - Condición OR</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <LabeledInput label="Pases largos / min jugados (mín. 3)" value={num((rules.relevo_limits as any)?.DEF || {}, 'long_passes_per_min') || 0.03} onChange={(v) => setRelevoLimit('DEF', 'long_passes_per_min', v)} step="0.01" />
                      <LabeledInput label="Pases hacia adelante / min jugados (mín. 3)" value={num((rules.relevo_limits as any)?.DEF || {}, 'forward_passes_per_min') || 0.03} onChange={(v) => setRelevoLimit('DEF', 'forward_passes_per_min', v)} step="0.01" />
                      <LabeledInput label="% Duelos suelo ganados (mín. 3)" value={num((rules.relevo_limits as any)?.DEF || {}, 'ground_duels_pct') || 55} onChange={(v) => setRelevoLimit('DEF', 'ground_duels_pct', v)} step="1" />
                      <LabeledInput label="% Duelos aéreos ganados (mín. 3)" value={num((rules.relevo_limits as any)?.DEF || {}, 'aerials_pct') || 75} onChange={(v) => setRelevoLimit('DEF', 'aerials_pct', v)} step="1" />
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-slate-800 text-sm mb-3">Bloque 3 (1 punto) - Condición OR</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <LabeledInput label="Recuperaciones / min jugados" value={num((rules.relevo_limits as any)?.DEF || {}, 'recoveries_per_min') || 0.10} onChange={(v) => setRelevoLimit('DEF', 'recoveries_per_min', v)} step="0.01" />
                      <LabeledInput label="Remate ABP / min jugados" value={num((rules.relevo_limits as any)?.DEF || {}, 'abp_remates_per_min') || 0.01} onChange={(v) => setRelevoLimit('DEF', 'abp_remates_per_min', v)} step="0.01" />
                      <LabeledInput label="Centros buenos / min jugados (mín. 2)" value={num((rules.relevo_limits as any)?.DEF || {}, 'crosses_per_min') || 0.02} onChange={(v) => setRelevoLimit('DEF', 'crosses_per_min', v)} step="0.01" />
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-slate-800 text-sm mb-3">Bloque 4 (1 punto) - Condición OR</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <LabeledInput label="Acciones ofensivas en 3/4 / min jugados" value={num((rules.relevo_limits as any)?.DEF || {}, 'off_actions_3_4_per_min') || 0.20} onChange={(v) => setRelevoLimit('DEF', 'off_actions_3_4_per_min', v)} step="0.01" />
                      <LabeledInput label="% Duelos totales ganados (mín. 10)" value={num((rules.relevo_limits as any)?.DEF || {}, 'total_duels_pct') || 90} onChange={(v) => setRelevoLimit('DEF', 'total_duels_pct', v)} step="1" />
                      <LabeledInput label="Goles (mín.)" value={num((rules.relevo_limits as any)?.DEF || {}, 'goals_count') || 1} onChange={(v) => setRelevoLimit('DEF', 'goals_count', v)} step="1" />
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'MED' && (
                <div className="space-y-6">
                  <div className="border border-slate-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-slate-800 text-sm mb-3">Bloque 1 (1 punto) - Condición OR</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <LabeledInput label="Acciones defensivas en campo rival / min" value={num((rules.relevo_limits as any)?.MED || {}, 'def_actions_opp_per_min') || 0.01} onChange={(v) => setRelevoLimit('MED', 'def_actions_opp_per_min', v)} step="0.01" />
                      <LabeledInput label="% Pases buenos (total)" value={num((rules.relevo_limits as any)?.MED || {}, 'pass_pct') || 66} onChange={(v) => setRelevoLimit('MED', 'pass_pct', v)} step="1" />
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-slate-800 text-sm mb-3">Bloque 2 (1 punto) - Condición OR</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <LabeledInput label="% Duelos aéreos ganados (mín. 3)" value={num((rules.relevo_limits as any)?.MED || {}, 'aerials_pct') || 45} onChange={(v) => setRelevoLimit('MED', 'aerials_pct', v)} step="1" />
                      <LabeledInput label="Recuperaciones campo rival / min" value={num((rules.relevo_limits as any)?.MED || {}, 'recoveries_opp_per_min') || 0.03} onChange={(v) => setRelevoLimit('MED', 'recoveries_opp_per_min', v)} step="0.01" />
                      <LabeledInput label="% Pases adelante + largos (sobre intentados)" value={num((rules.relevo_limits as any)?.MED || {}, 'fwd_long_pct') || 10} onChange={(v) => setRelevoLimit('MED', 'fwd_long_pct', v)} step="1" />
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-slate-800 text-sm mb-3">Bloque 3 (1 punto) - Condición OR</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <LabeledInput label="% Remates a puerta (mín. 2)" value={num((rules.relevo_limits as any)?.MED || {}, 'shots_on_pct') || 66} onChange={(v) => setRelevoLimit('MED', 'shots_on_pct', v)} step="1" />
                      <LabeledInput label="Acciones ofensivas campo rival / min" value={num((rules.relevo_limits as any)?.MED || {}, 'off_actions_opp_per_min') || 0.85} onChange={(v) => setRelevoLimit('MED', 'off_actions_opp_per_min', v)} step="0.01" />
                      <LabeledInput label="(Intercept. + recup.) en 3/4 / min" value={num((rules.relevo_limits as any)?.MED || {}, 'intercept_recup_3_4_per_min') || 0.02} onChange={(v) => setRelevoLimit('MED', 'intercept_recup_3_4_per_min', v)} step="0.01" />
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-slate-800 text-sm mb-3">Bloque 4 (1 punto) - Condición OR</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <LabeledInput label="Asistencias totales (mín.)" value={num((rules.relevo_limits as any)?.MED || {}, 'assists_total') || 3} onChange={(v) => setRelevoLimit('MED', 'assists_total', v)} step="1" />
                      <LabeledInput label="% Regates completados (mín. 2)" value={num((rules.relevo_limits as any)?.MED || {}, 'takeons_pct') || 75} onChange={(v) => setRelevoLimit('MED', 'takeons_pct', v)} step="1" />
                      <LabeledInput label="Goles (mín.)" value={num((rules.relevo_limits as any)?.MED || {}, 'goals_count') || 1} onChange={(v) => setRelevoLimit('MED', 'goals_count', v)} step="1" />
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'DEL' && (
                <div className="space-y-6">
                  <div className="border border-slate-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-slate-800 text-sm mb-3">Bloque 1 (1 punto) - Condición OR</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <LabeledInput label="Participaciones en 3/4 campo / min" value={num((rules.relevo_limits as any)?.DEL || {}, 'final_third_events_per_min') || 0.09} onChange={(v) => setRelevoLimit('DEL', 'final_third_events_per_min', v)} step="0.01" />
                      <LabeledInput label="Recuperaciones campo rival / min" value={num((rules.relevo_limits as any)?.DEL || {}, 'recoveries_opp_per_min') || 0.009} onChange={(v) => setRelevoLimit('DEL', 'recoveries_opp_per_min', v)} step="0.001" />
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-slate-800 text-sm mb-3">Bloque 2 (1 punto) - Condición OR</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <LabeledInput label="% Duelos aéreos ganados (mín. 3)" value={num((rules.relevo_limits as any)?.DEL || {}, 'aerials_pct') || 40} onChange={(v) => setRelevoLimit('DEL', 'aerials_pct', v)} step="1" />
                      <LabeledInput label="Tiros a puerta (mín.)" value={num((rules.relevo_limits as any)?.DEL || {}, 'shots_on_target_count') || 1} onChange={(v) => setRelevoLimit('DEL', 'shots_on_target_count', v)} step="1" />
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-slate-800 text-sm mb-3">Bloque 3 (1 punto) - Condición OR</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <LabeledInput label="% Remates a puerta (mín. 3)" value={num((rules.relevo_limits as any)?.DEL || {}, 'shots_on_pct') || 70} onChange={(v) => setRelevoLimit('DEL', 'shots_on_pct', v)} step="1" />
                      <LabeledInput label="% Regates completados (mín. 2)" value={num((rules.relevo_limits as any)?.DEL || {}, 'takeons_pct') || 75} onChange={(v) => setRelevoLimit('DEL', 'takeons_pct', v)} step="1" />
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-slate-800 text-sm mb-3">Bloque 4 (1 punto) - Condición OR</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <LabeledInput label="Asistencias totales (mín.)" value={num((rules.relevo_limits as any)?.DEL || {}, 'assists_total') || 3} onChange={(v) => setRelevoLimit('DEL', 'assists_total', v)} step="1" />
                      <LabeledInput label="Acciones ofensivas campo rival / min" value={num((rules.relevo_limits as any)?.DEL || {}, 'off_actions_opp_per_min') || 0.40} onChange={(v) => setRelevoLimit('DEL', 'off_actions_opp_per_min', v)} step="0.01" />
                      <LabeledInput label="Goles (mín.)" value={num((rules.relevo_limits as any)?.DEL || {}, 'goals_count') || 1} onChange={(v) => setRelevoLimit('DEL', 'goals_count', v)} step="1" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {error && <p className="text-red-600 text-sm font-medium">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? 'Guardado' : saving ? 'Guardando…' : 'Guardar puntuación'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function NumberInput({
  value, onChange, step = '0.1',
}: {
  value: number
  onChange: (v: string) => void
  step?: string
}) {
  return (
    <input
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1.5 rounded-lg border-2 border-slate-200 outline-none focus:border-amber-500 text-sm text-center"
    />
  )
}

function LabeledInput({
  label, value, onChange, step = '0.1',
}: {
  label: string
  value: number
  onChange: (v: string) => void
  step?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      <NumberInput value={value} onChange={onChange} step={step} />
    </div>
  )
}
