'use client'

import { useEffect, useState } from 'react'
import { Trophy, Save, Check, Info } from 'lucide-react'
import {
  type ScoringRules,
  POSITIONS,
  POSITION_LABELS,
  EDITABLE_EVENTS,
  BONUS_LABELS,
  PENALTY_LABELS,
  num,
} from '@/lib/scoring-config'

export function ScoringConfigPanel() {
  const [rules, setRules] = useState<ScoringRules | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/admin/scoring-config')
        if (res.ok) {
          const body = await res.json()
          setRules(body.rules ?? null)
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

  // Actualiza un valor anidado del clon de reglas (events / bonuses_per_X / penalties_per_X).
  const setEventValue = (key: string, valueKey: string, raw: string) => {
    const value = raw === '' || raw === '-' ? 0 : Number(raw)
    setRules((r) => {
      if (!r) return r
      const next = JSON.parse(JSON.stringify(r)) as ScoringRules
      const events = (next.events ??= {}) as Record<string, Record<string, unknown>>
      const target = (events[key] ??= {})
      target[valueKey] = value
      return next
    })
  }

  const setBonusValue = (key: string, raw: string) => {
    const value = raw === '' || raw === '-' ? 0 : Number(raw)
    setRules((r) => {
      if (!r) return r
      const next = JSON.parse(JSON.stringify(r)) as ScoringRules
      const bonuses = (next.bonuses_per_X ??= {}) as Record<string, Record<string, unknown>>
      const target = (bonuses[key] ??= { required: 1 })
      target.points = value
      return next
    })
  }

  const setRelevoValue = (key: string, raw: string) => {
    const value = raw === '' || raw === '-' ? 0 : Number(raw)
    setRules((r) => {
      if (!r) return r
      const next = JSON.parse(JSON.stringify(r)) as ScoringRules
      const relevoRules = (next.relevo_rules ??= {}) as Record<string, unknown>
      relevoRules[key] = value
      return next
    })
  }

  const setPenaltyValue = (group: string, pos: string, raw: string) => {
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
          bonuses_per_X: rules.bonuses_per_X,
          penalties_per_X: rules.penalties_per_X,
          relevo_rules: rules.relevo_rules,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || 'No se pudo guardar')
      }
      const body = await res.json()
      if (body.rules) setRules(body.rules)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const events = (rules?.events ?? {}) as Record<string, Record<string, unknown>>
  const bonuses = (rules?.bonuses_per_X ?? {}) as Record<string, Record<string, unknown>>
  const lostBalls = ((rules?.penalties_per_X as Record<string, unknown>)?.lost_balls ?? {}) as Record<string, Record<string, unknown>>
  const relevo = (rules?.relevo_rules ?? {}) as Record<string, unknown>

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

          {/* Bonus por métrica */}
          <section className="space-y-3">
            <p className="text-sm font-semibold text-slate-700">Bonus por métrica (puntos por unidad)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.keys(BONUS_LABELS).map((key) => (
                <LabeledInput
                  key={key}
                  label={BONUS_LABELS[key] ?? key}
                  value={num(bonuses[key], 'points')}
                  onChange={(v) => setBonusValue(key, v)}
                  step="0.05"
                />
              ))}
            </div>
          </section>

          {/* Penalizaciones por métrica */}
          <section className="space-y-3">
            <p className="text-sm font-semibold text-slate-700">{PENALTY_LABELS.lost_balls ?? 'Penalizaciones'}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {POSITIONS.map((p) => (
                <LabeledInput
                  key={p}
                  label={POSITION_LABELS[p]}
                  value={num(lostBalls[p], 'points')}
                  onChange={(v) => setPenaltyValue('lost_balls', p, v)}
                  step="0.05"
                />
              ))}
            </div>
          </section>

          {/* RELEVO Rules */}
          <section className="space-y-3">
            <p className="text-sm font-semibold text-slate-700">Reglas Puntos RELEVO (Algoritmo)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 bg-violet-50 p-4 rounded-xl border border-violet-100">
              <LabeledInput label="Duelos % cada paso" value={Number(relevo.duels_step_percent ?? 10)} onChange={(v) => setRelevoValue('duels_step_percent', v)} step="1" />
              <LabeledInput label="Duelos ptos por paso" value={Number(relevo.duels_points_per_step ?? 0.2)} onChange={(v) => setRelevoValue('duels_points_per_step', v)} step="0.1" />
              
              <LabeledInput label="Participación % paso" value={Number(relevo.participation_step_percent ?? 10)} onChange={(v) => setRelevoValue('participation_step_percent', v)} step="1" />
              <LabeledInput label="Participación ptos por paso" value={Number(relevo.participation_points_per_step ?? 1)} onChange={(v) => setRelevoValue('participation_points_per_step', v)} step="1" />
              
              <LabeledInput label="Pases mín int." value={Number(relevo.min_passes ?? 10)} onChange={(v) => setRelevoValue('min_passes', v)} step="1" />
              <LabeledInput label="Pases % Excel (>X)" value={Number(relevo.pass_accuracy_excel ?? 92)} onChange={(v) => setRelevoValue('pass_accuracy_excel', v)} step="1" />
              
              <LabeledInput label="Pases C. Rival mín int." value={Number(relevo.min_opp_half_passes ?? 10)} onChange={(v) => setRelevoValue('min_opp_half_passes', v)} step="1" />
              <LabeledInput label="Pases C. Rival % Alto (>X)" value={Number(relevo.opp_half_accuracy_high ?? 75)} onChange={(v) => setRelevoValue('opp_half_accuracy_high', v)} step="1" />
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
