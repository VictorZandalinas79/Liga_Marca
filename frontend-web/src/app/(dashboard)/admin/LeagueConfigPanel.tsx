'use client'

import { useEffect, useState } from 'react'
import { Settings, Plus, X, Save, Check } from 'lucide-react'
import { DEFAULT_LEAGUE_CONFIG, parseFormation, type LeagueConfig } from '@/lib/league-config'

export function LeagueConfigPanel({ onStateChange }: { onStateChange?: (state: any) => void }) {
  const [config, setConfig] = useState<LeagueConfig>(DEFAULT_LEAGUE_CONFIG)
  const [savedConfig, setSavedConfig] = useState<LeagueConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [newFormation, setNewFormation] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/admin/league-config')
        if (res.ok) {
          const body = await res.json()
          if (body.config) {
            const loadedConfig = { ...DEFAULT_LEAGUE_CONFIG, ...body.config }
            setConfig(loadedConfig)
            setSavedConfig(loadedConfig)
          }
        }
      } catch {
        /* mantiene los valores por defecto */
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const setNum = (field: keyof LeagueConfig, value: string) => {
    setConfig(c => ({ ...c, [field]: value === '' ? 0 : Number(value) }))
  }

  const addFormation = () => {
    const f = newFormation.trim()
    if (!f) return
    if (!parseFormation(f)) {
      setError(`"${f}" no es una táctica válida (debe ser DEF-MED-DEL y sumar 10, ej. 4-4-2).`)
      return
    }
    if (config.formations.includes(f)) {
      setNewFormation('')
      return
    }
    setConfig(c => ({ ...c, formations: [...c.formations, f] }))
    setNewFormation('')
    setError('')
  }

  const removeFormation = (f: string) => {
    setConfig(c => ({ ...c, formations: c.formations.filter(x => x !== f) }))
  }

  const save = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/admin/league-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || 'No se pudo guardar')
      }
      const body = await res.json()
      if (body.config) {
        const updatedConfig = { ...DEFAULT_LEAGUE_CONFIG, ...body.config }
        setConfig(updatedConfig)
        setSavedConfig(updatedConfig)
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
    if (!config || !savedConfig) {
      onStateChange({ hasChanges: false, description: [], save: async () => {}, discard: () => {} })
      return
    }

    const diffs: string[] = []
    
    if (config.budget_limit !== savedConfig.budget_limit) {
      diffs.push(`Presupuesto máximo: ${savedConfig.budget_limit}M ➔ ${config.budget_limit}M`)
    }
    if (config.max_players_per_team !== savedConfig.max_players_per_team) {
      diffs.push(`Máx. jugadores del mismo equipo: ${savedConfig.max_players_per_team} ➔ ${config.max_players_per_team}`)
    }
    if (config.fantasy_starting_matchday !== savedConfig.fantasy_starting_matchday) {
      diffs.push(`Jornada de inicio: J${savedConfig.fantasy_starting_matchday} ➔ J${config.fantasy_starting_matchday}`)
    }
    if (config.max_changes_per_matchday !== savedConfig.max_changes_per_matchday) {
      diffs.push(`Cambios por jornada: ${savedConfig.max_changes_per_matchday} ➔ ${config.max_changes_per_matchday}`)
    }
    if (config.div1_win_percent !== savedConfig.div1_win_percent) {
      diffs.push(`Div 1 Ganan: ${savedConfig.div1_win_percent} ➔ ${config.div1_win_percent}`)
    }
    if (config.div1_lose_percent !== savedConfig.div1_lose_percent) {
      diffs.push(`Div 1 Pierden: ${savedConfig.div1_lose_percent} ➔ ${config.div1_lose_percent}`)
    }
    if (config.div2_win_percent !== savedConfig.div2_win_percent) {
      diffs.push(`Div 2 Ganan: ${savedConfig.div2_win_percent} ➔ ${config.div2_win_percent}`)
    }
    if (config.div2_lose_percent !== savedConfig.div2_lose_percent) {
      diffs.push(`Div 2 Pierden: ${savedConfig.div2_lose_percent} ➔ ${config.div2_lose_percent}`)
    }
    if (config.div3_win_percent !== savedConfig.div3_win_percent) {
      diffs.push(`Div 3 Ganan: ${savedConfig.div3_win_percent} ➔ ${config.div3_win_percent}`)
    }
    if (config.div3_lose_percent !== savedConfig.div3_lose_percent) {
      diffs.push(`Div 3 Pierden: ${savedConfig.div3_lose_percent} ➔ ${config.div3_lose_percent}`)
    }
    if (config.pay_winner !== savedConfig.pay_winner) {
      diffs.push(`Pago Ganador: ${savedConfig.pay_winner}€ ➔ ${config.pay_winner}€`)
    }
    if (config.pay_loser !== savedConfig.pay_loser) {
      diffs.push(`Pago Perdedor: ${savedConfig.pay_loser}€ ➔ ${config.pay_loser}€`)
    }
    if (config.pay_rest !== savedConfig.pay_rest) {
      diffs.push(`Pago Resto: ${savedConfig.pay_rest}€ ➔ ${config.pay_rest}€`)
    }
    if (config.starting_balance !== savedConfig.starting_balance) {
      diffs.push(`Saldo Inicial: ${savedConfig.starting_balance}€ ➔ ${config.starting_balance}€`)
    }
    if (config.infraction_penalty_cost !== savedConfig.infraction_penalty_cost) {
      diffs.push(`Penalización por infracción: ${savedConfig.infraction_penalty_cost}€ ➔ ${config.infraction_penalty_cost}€`)
    }
    if (config.matchday_start_hours_before !== savedConfig.matchday_start_hours_before) {
      diffs.push(`Inicio jornada: ${savedConfig.matchday_start_hours_before}h antes ➔ ${config.matchday_start_hours_before}h antes`)
    }
    if (config.matchday_end_hours_after !== savedConfig.matchday_end_hours_after) {
      diffs.push(`Cierre jornada: ${savedConfig.matchday_end_hours_after}h después ➔ ${config.matchday_end_hours_after}h después`)
    }

    const savedForms = savedConfig.formations || []
    const currentForms = config.formations || []
    const addedForms = currentForms.filter(f => !savedForms.includes(f))
    const removedForms = savedForms.filter(f => !currentForms.includes(f))
    addedForms.forEach(f => diffs.push(`Táctica añadida: ${f}`))
    removedForms.forEach(f => diffs.push(`Táctica eliminada: ${f}`))

    onStateChange({
      hasChanges: diffs.length > 0,
      description: diffs.map(d => `Reglas del juego: ${d}`),
      save: save,
      discard: () => setConfig(savedConfig)
    })
  }, [config, savedConfig])

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
          <Settings className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Reglas del Juego</h2>
          <p className="text-sm text-slate-500">Presupuesto, tácticas, jugadores por equipo, pagos y horario de jornada</p>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm py-6 text-center">Cargando configuración…</p>
      ) : (
        <>
          {/* Límites */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NumberField
              label="Presupuesto máximo (M)"
              value={config.budget_limit}
              onChange={(v) => setNum('budget_limit', v)}
              step="1"
            />
            <NumberField
              label="Máx. jugadores del mismo equipo"
              value={config.max_players_per_team}
              onChange={(v) => setNum('max_players_per_team', v)}
              step="1"
            />
            <NumberField
              label="Jornada en la que empieza el juego"
              value={config.fantasy_starting_matchday}
              onChange={(v) => setNum('fantasy_starting_matchday', v)}
              step="1"
            />
            <NumberField
              label="Cambios por jornada (después del inicio)"
              value={config.max_changes_per_matchday}
              onChange={(v) => setNum('max_changes_per_matchday', v)}
              step="1"
            />
          </div>
          <p className="text-xs text-slate-500 -mt-2">
            Los jugadores puntúan desde la J1, pero los equipos de los usuarios no
            contabilizan puntos hasta la jornada indicada. Hasta entonces el mercado
            queda abierto y la cuenta atrás marca el inicio de esa jornada.
          </p>

          {/* Pagos por jornada */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Pagos por jornada y Ganadores</p>
            <div className="space-y-3 mb-6">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cantidad de Ganadores y Perdedores (Posiciones)</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1ª División */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p className="text-sm font-bold text-slate-700 mb-2">1ª División</p>
                  <div className="space-y-2">
                    <NumberField label="Ganan (Nº Primeros)" value={config.div1_win_percent} onChange={(v) => setNum('div1_win_percent', v)} step="1" />
                    <NumberField label="Pierden (Nº Últimos)" value={config.div1_lose_percent} onChange={(v) => setNum('div1_lose_percent', v)} step="1" />
                    <NumberField label="Descienden (Nº Equipos)" value={config.div1_descensos} onChange={(v) => setNum('div1_descensos', v)} step="1" />
                  </div>
                </div>

                {/* 2ª División */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p className="text-sm font-bold text-slate-700 mb-2">2ª División</p>
                  <div className="space-y-2">
                    <NumberField label="Ganan (Nº Primeros)" value={config.div2_win_percent} onChange={(v) => setNum('div2_win_percent', v)} step="1" />
                    <NumberField label="Pierden (Nº Últimos)" value={config.div2_lose_percent} onChange={(v) => setNum('div2_lose_percent', v)} step="1" />
                    <NumberField label="Descienden (Nº Equipos)" value={config.div2_descensos} onChange={(v) => setNum('div2_descensos', v)} step="1" />
                  </div>
                </div>

                {/* 3ª División */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p className="text-sm font-bold text-slate-700 mb-2">3ª División</p>
                  <div className="space-y-2">
                    <NumberField label="Ganan (Nº Primeros)" value={config.div3_win_percent} onChange={(v) => setNum('div3_win_percent', v)} step="1" />
                    <NumberField label="Pierden (Nº Últimos)" value={config.div3_lose_percent} onChange={(v) => setNum('div3_lose_percent', v)} step="1" />
                    <NumberField label="Descienden (Nº Equipos)" value={config.div3_descensos} onChange={(v) => setNum('div3_descensos', v)} step="1" />
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <NumberField label="Ganador (€)" value={config.pay_winner} onChange={(v) => setNum('pay_winner', v)} step="0.5" />
              <NumberField label="Perdedor (€)" value={config.pay_loser} onChange={(v) => setNum('pay_loser', v)} step="0.5" />
              <NumberField label="El resto (€)" value={config.pay_rest} onChange={(v) => setNum('pay_rest', v)} step="0.5" />
            </div>
            
            <p className="text-sm font-semibold text-slate-700 mt-6 mb-2">Sanciones e Infracciones</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumberField 
                label="Saldo Inicial (Virtual)" 
                value={config.starting_balance} 
                onChange={(v) => setNum('starting_balance', v)} 
                step="1" 
              />
              <NumberField 
                label="Penalización por infracción (Alineación, Táctica...)" 
                value={config.infraction_penalty_cost} 
                onChange={(v) => setNum('infraction_penalty_cost', v)} 
                step="0.5" 
              />
            </div>
          </div>

          {/* Horario de jornada */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Horario de la jornada (horas)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumberField
                label="Empieza (horas antes del 1er partido)"
                value={config.matchday_start_hours_before}
                onChange={(v) => setNum('matchday_start_hours_before', v)}
                step="0.5"
              />
              <NumberField
                label="Cierra (horas tras el último partido)"
                value={config.matchday_end_hours_after}
                onChange={(v) => setNum('matchday_end_hours_after', v)}
                step="0.5"
              />
            </div>
          </div>

          {/* Tácticas */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Tácticas permitidas</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {config.formations.length === 0 && (
                <span className="text-sm text-slate-400">Sin tácticas configuradas</span>
              )}
              {config.formations.map((f) => (
                <span key={f} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold">
                  {f}
                  <button onClick={() => removeFormation(f)} className="text-slate-400 hover:text-red-500" title="Quitar">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newFormation}
                onChange={(e) => setNewFormation(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFormation() } }}
                placeholder="Ej. 4-4-2"
                className="w-32 px-3 py-2 rounded-lg border-2 border-slate-200 outline-none focus:border-indigo-500 text-sm"
              />
              <button
                onClick={addFormation}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 text-sm"
              >
                <Plus className="w-4 h-4" /> Añadir
              </button>
            </div>
          </div>

          {error && <p className="text-red-600 text-sm font-medium">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? 'Guardado' : saving ? 'Guardando…' : 'Guardar reglas'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function NumberField({
  label, value, onChange, step,
}: {
  label: string
  value: number
  onChange: (v: string) => void
  step: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      <input
        type="number"
        min="0"
        step={step}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border-2 border-slate-200 outline-none focus:border-indigo-500 text-sm"
      />
    </div>
  )
}
