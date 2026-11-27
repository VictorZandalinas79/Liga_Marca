'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertCircle, Ban, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import {
  activeIgnoredNotices,
  defaultNoticeMessage,
  NOTICE_DAYS_BEFORE,
  type IgnoredMatchday,
} from '@/lib/ignored-matchdays'

type Row = { key: string; matchday: string; message: string }
type FixtureLite = { matchday: number | null; start_time: string | null; status: string | null }

const MAX_MATCHDAY = 38

let rowSeq = 0
const newKey = () => `row-${++rowSeq}`

function toRows(list: IgnoredMatchday[]): Row[] {
  return list.map(i => ({ key: newKey(), matchday: String(i.matchday), message: i.message }))
}

function normalize(rows: Row[]): IgnoredMatchday[] {
  return rows
    .filter(r => r.matchday !== '')
    .map(r => ({ matchday: Number(r.matchday), message: r.message.trim() }))
    .sort((a, b) => a.matchday - b.matchday)
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Admin → Jornadas ignoradas. Cada fila es una jornada cuyos puntos no cuentan
 * para el juego, con el aviso que verán los usuarios (banner superior y
 * campana) desde 5 días antes de su primer partido hasta que acaben todos.
 */
export function IgnoredMatchdaysPanel({
  onStateChange,
}: {
  onStateChange?: (state: { hasChanges: boolean; description: string[]; save: () => Promise<void>; discard: () => void }) => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [saved, setSaved] = useState<IgnoredMatchday[]>([])
  const [fixtures, setFixtures] = useState<FixtureLite[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [res, fx] = await Promise.all([
        fetch('/api/admin/ignored-matchdays'),
        createClient().from('fixtures').select('matchday, start_time, status'),
      ])
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Error cargando las jornadas ignoradas')
      setSaved(body.ignoredMatchdays)
      setRows(toRows(body.ignoredMatchdays))
      setFixtures((fx.data ?? []) as FixtureLite[])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial, igual que el resto de paneles
  useEffect(() => { load() }, [])

  const current = useMemo(() => normalize(rows), [rows])
  const hasChanges = JSON.stringify(current) !== JSON.stringify(saved)

  const duplicates = useMemo(() => {
    const seen = new Set<string>()
    const dup = new Set<string>()
    for (const r of rows) {
      if (!r.matchday) continue
      if (seen.has(r.matchday)) dup.add(r.matchday)
      seen.add(r.matchday)
    }
    return dup
  }, [rows])

  const firstKickoffByMd = useMemo(() => {
    const m = new Map<number, string>()
    for (const f of fixtures) {
      if (!f.matchday || !f.start_time) continue
      const cur = m.get(f.matchday)
      if (!cur || f.start_time < cur) m.set(f.matchday, f.start_time)
    }
    return m
  }, [fixtures])

  const activeNow = useMemo(
    () => new Set(activeIgnoredNotices(saved, fixtures).map(n => n.matchday)),
    [saved, fixtures]
  )

  const save = async () => {
    if (duplicates.size > 0) {
      setError('Hay jornadas repetidas')
      return
    }
    setSaving(true)
    setError('')
    setOkMsg('')
    try {
      const res = await fetch('/api/admin/ignored-matchdays', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ignoredMatchdays: current }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Error guardando')
      setSaved(body.ignoredMatchdays)
      setRows(toRows(body.ignoredMatchdays))
      setOkMsg('Guardado. La clasificación ya no cuenta estas jornadas.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    setRows(toRows(saved))
    setError('')
  }

  useEffect(() => {
    onStateChange?.({
      hasChanges,
      description: hasChanges ? ['Jornadas ignoradas'] : [],
      save,
      discard,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasChanges, rows, saved])

  const updateRow = (key: string, patch: Partial<Row>) => {
    setOkMsg('')
    setRows(list => list.map(r => (r.key === key ? { ...r, ...patch } : r)))
  }
  const addRow = () => {
    setOkMsg('')
    setRows(list => [...list, { key: newKey(), matchday: '', message: '' }])
  }
  const removeRow = (key: string) => {
    setOkMsg('')
    setRows(list => list.filter(r => r.key !== key))
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-6">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center shrink-0">
            <Ban className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Jornadas ignoradas</h2>
            <p className="text-sm text-slate-500">
              Sus puntos no cuentan para el juego (clasificación, pagos, podios ni sanciones). El aviso se muestra
              arriba de la pantalla y en la campana desde {NOTICE_DAYS_BEFORE} días antes del primer partido de la
              jornada hasta que terminan todos sus partidos.
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors shrink-0"
          title="Recargar"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border-b border-red-100 flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="p-5 space-y-3">
        {loading ? (
          <p className="text-center text-slate-400 text-sm py-4">Cargando...</p>
        ) : rows.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-4">No hay ninguna jornada ignorada.</p>
        ) : (
          rows.map(r => {
            const md = Number(r.matchday)
            const kickoff = r.matchday ? firstKickoffByMd.get(md) : undefined
            const noticeFrom = kickoff
              ? new Date(new Date(kickoff).getTime() - NOTICE_DAYS_BEFORE * 24 * 60 * 60 * 1000).toISOString()
              : null
            const isDup = duplicates.has(r.matchday)
            return (
              <div key={r.key} className="flex flex-col sm:flex-row gap-3 sm:items-start p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="sm:w-40 shrink-0">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jornada</label>
                  <select
                    value={r.matchday}
                    onChange={e => updateRow(r.key, { matchday: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border-2 outline-none text-sm bg-white ${isDup ? 'border-red-400' : 'border-slate-200 focus:border-rose-500'}`}
                  >
                    <option value="">Elegir…</option>
                    {Array.from({ length: MAX_MATCHDAY }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>Jornada {n}</option>
                    ))}
                  </select>
                  {isDup && <p className="text-xs text-red-500 mt-1">Repetida</p>}
                </div>
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Aviso para los usuarios</label>
                  <textarea
                    value={r.message}
                    onChange={e => updateRow(r.key, { message: e.target.value })}
                    maxLength={500}
                    rows={2}
                    placeholder={r.matchday ? defaultNoticeMessage(md) : 'Motivo por el que se ignora la jornada'}
                    className="w-full px-3 py-2 rounded-lg border-2 border-slate-200 outline-none focus:border-rose-500 text-sm resize-y bg-white"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    {kickoff && noticeFrom
                      ? <>Primer partido: {formatDateTime(kickoff)} · Aviso visible desde {formatDateTime(noticeFrom)}</>
                      : r.matchday ? 'Esta jornada aún no tiene partidos con fecha.' : 'Elige una jornada.'}
                    {activeNow.has(md) && <span className="ml-2 font-semibold text-rose-600">● Aviso visible ahora</span>}
                  </p>
                </div>
                <button
                  onClick={() => removeRow(r.key)}
                  className="self-end sm:self-center p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Quitar jornada"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            )
          })
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            onClick={addRow}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 hover:border-rose-400 hover:text-rose-600 text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> Añadir jornada
          </button>
          <div className="flex items-center gap-3">
            {okMsg && <span className="text-sm text-emerald-600">{okMsg}</span>}
            <button
              onClick={save}
              disabled={!hasChanges || saving || duplicates.size > 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white text-sm font-semibold transition-colors"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
