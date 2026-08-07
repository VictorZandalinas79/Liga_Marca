'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Search, Download, ShieldCheck, CheckCircle2, XCircle, Users, RefreshCw, Euro,
  Pencil, Trash2, X, AlertTriangle,
} from 'lucide-react'
import { LeagueConfigPanel } from './LeagueConfigPanel'
import { ScoringConfigPanel } from './ScoringConfigPanel'
import { UnmatchedPlayersPanel } from './UnmatchedPlayersPanel'
import { PrizesPanel } from './PrizesPanel'
import { useLeagueConfig } from '@/lib/league-config'

type AdminUser = {
  id: string
  email: string
  full_name: string
  phone: string
  has_paid: boolean
  paid_at: string | null
  amount_paid: number
  division: number | null
  entry_fee_paid: number
  infraction_penalties: number
  collected_by: string | null
  created_at: string
}

const DIVISION_LABELS: Record<number, string> = { 1: '1ª División', 2: '2ª División', 3: '3ª División' }
function divisionLabel(d: number | null): string {
  return d ? DIVISION_LABELS[d] : 'Sin asignar'
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}
function formatEuro(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

export default function AdminPage() {
  const config = useLeagueConfig()
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>('all')
  const [divFilter, setDivFilter] = useState<'all' | '1' | '2' | '3' | 'none'>('all')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [divisionLock, setDivisionLock] = useState<{ locked: boolean; lockAt: string | null; startingMatchday: number } | null>(null)

  const [unsavedPanels, setUnsavedPanels] = useState<Record<string, {
    hasChanges: boolean
    description: string[]
    save: () => Promise<void>
    discard: () => void
  }>>({})
  const [pendingNavigation, setPendingNavigation] = useState<{ type: 'push' | 'signout'; href?: string } | null>(null)

  const handlePanelStateChange = (panelId: string, state: {
    hasChanges: boolean
    description: string[]
    save: () => Promise<void>
    discard: () => void
  }) => {
    setUnsavedPanels(prev => {
      const prevPanel = prev[panelId]
      const hasChangesChanged = prevPanel?.hasChanges !== state.hasChanges
      const descChanged = JSON.stringify(prevPanel?.description) !== JSON.stringify(state.description)
      if (!hasChangesChanged && !descChanged) {
        return prev
      }
      return { ...prev, [panelId]: state }
    })
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    localStorage.removeItem('lmv:lastActivity')
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const panelsWithChanges = Object.entries(unsavedPanels).filter(([_, p]) => p.hasChanges)
      if (panelsWithChanges.length === 0) return

      let target = e.target as HTMLElement | null
      while (target && target.tagName !== 'A') {
        target = target.parentElement
      }

      if (target && target.tagName === 'A') {
        const href = target.getAttribute('href')
        if (href && (href.startsWith('/') || href.startsWith('http')) && !href.includes('#') && href !== '/admin') {
          e.preventDefault()
          e.stopPropagation()
          setPendingNavigation({ type: 'push', href })
        }
      }

      // Intercept logout button
      const btn = (e.target as HTMLElement).closest('button')
      if (btn && (btn.innerText.includes('Salir') || btn.title === 'Salir' || btn.getAttribute('title') === 'Salir')) {
        e.preventDefault()
        e.stopPropagation()
        setPendingNavigation({ type: 'signout' })
      }
    }

    const handleWindowBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasChanges = Object.values(unsavedPanels).some(p => p.hasChanges)
      if (hasChanges) {
        e.preventDefault()
        e.returnValue = 'Tienes cambios sin guardar. ¿Deseas salir?'
        return e.returnValue
      }
    }

    document.addEventListener('click', handleAnchorClick, true)
    window.addEventListener('beforeunload', handleWindowBeforeUnload)

    return () => {
      document.removeEventListener('click', handleAnchorClick, true)
      window.removeEventListener('beforeunload', handleWindowBeforeUnload)
    }
  }, [unsavedPanels])

  // Modales
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null)

  const loadUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/users')
      if (res.status === 401 || res.status === 403) {
        setForbidden(true)
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Error cargando usuarios')
      }
      const body = await res.json()
      setUsers(body.users)
      setDivisionLock(body.divisionLock ?? null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  // Guarda cambios parciales con actualización optimista.
  const saveUser = async (id: string, patch: Partial<AdminUser>) => {
    const prev = users.find((u) => u.id === id)
    if (!prev) return
    setSavingId(id)
    setUsers((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)))
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || 'No se pudo guardar')
      }
    } catch (err) {
      setUsers((list) => list.map((u) => (u.id === id ? prev : u)))
      setError(err instanceof Error ? err.message : 'No se pudo guardar el cambio')
      throw err
    } finally {
      setSavingId(null)
    }
  }

  const togglePaid = (user: AdminUser) => {
    const next = !user.has_paid
    saveUser(user.id, { has_paid: next, paid_at: next ? user.paid_at ?? new Date().toISOString() : null }).catch(() => {})
  }

  const onDeleted = (id: string) => {
    setUsers((list) => list.filter((u) => u.id !== id))
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (filter === 'paid' && !u.has_paid) return false
      if (filter === 'unpaid' && u.has_paid) return false
      if (divFilter === 'none' && u.division != null) return false
      if (divFilter !== 'all' && divFilter !== 'none' && u.division !== Number(divFilter)) return false
      if (!q) return true
      return (
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.phone.toLowerCase().includes(q)
      )
    })
  }, [users, search, filter, divFilter])

  const stats = useMemo(() => {
    const paid = users.filter((u) => u.has_paid).length
    const collected = users.reduce((sum, u) => sum + (u.has_paid ? (u.entry_fee_paid || 0) : 0), 0)
    const unassigned = users.filter((u) => u.division == null).length
    return { total: users.length, paid, unpaid: users.length - paid, collected, unassigned }
  }, [users])

  const exportCsv = () => {
    const headers = ['Nombre', 'Email', 'Teléfono', 'División', 'Ha pagado', 'Cuota Inicial (€)', 'Sanciones (€)', 'Dinero Actual (€)', 'Fecha de pago', 'Cobrado por', 'Fecha de registro']
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
    const rows = filtered.map((u) => {
      const sanciones = -((u.amount_paid || 0) + (u.infraction_penalties || 0))
      const dineroActual = (u.entry_fee_paid || 0) - (config.starting_balance ?? 45) + sanciones
      return [
        u.full_name, u.email, u.phone,
        divisionLabel(u.division),
        u.has_paid ? 'Sí' : 'No',
        (u.entry_fee_paid || 0).toFixed(2).replace('.', ','),
        sanciones.toFixed(2).replace('.', ','),
        dineroActual.toFixed(2).replace('.', ','),
        formatDate(u.paid_at),
        u.collected_by || '',
        formatDate(u.created_at),
      ].map((v) => escape(String(v ?? ''))).join(',')
    })
    const csv = '﻿' + [headers.map(escape).join(','), ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `registrados_lmv_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Acceso restringido</h1>
          <p className="text-slate-600">Esta sección es solo para administradores.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-emerald-500 rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Administración</h1>
            <p className="text-sm text-slate-500">Usuarios registrados y control de pagos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadUsers}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold hover:border-slate-300 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Users className="w-5 h-5" />} label="Total" value={String(stats.total)} color="slate" />
        <StatCard icon={<CheckCircle2 className="w-5 h-5" />} label="Han pagado" value={String(stats.paid)} color="emerald" />
        <StatCard icon={<XCircle className="w-5 h-5" />} label="Pendientes" value={String(stats.unpaid)} color="amber" />
        <StatCard icon={<Euro className="w-5 h-5" />} label="Recaudado" value={formatEuro(stats.collected)} color="emerald" />
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email o teléfono…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-slate-200 outline-none focus:border-emerald-500 bg-white"
          />
        </div>
        <select
          value={divFilter}
          onChange={(e) => setDivFilter(e.target.value as typeof divFilter)}
          className="px-3 py-2.5 rounded-xl border-2 border-slate-200 outline-none focus:border-emerald-500 bg-white font-semibold text-slate-700 text-sm"
        >
          <option value="all">Todas las divisiones</option>
          <option value="1">1ª División</option>
          <option value="2">2ª División</option>
          <option value="3">3ª División</option>
          <option value="none">Sin asignar</option>
        </select>
        <div className="flex bg-slate-100 rounded-xl p-1">
          {([['all', 'Todos'], ['paid', 'Pagados'], ['unpaid', 'Pendientes']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                filter === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 text-red-700 text-sm font-medium">{error}</div>
      )}

      {/* Estado del cierre de divisiones. Cada división es una liga aparte
          (clasificación, sanciones y pagos propios), así que hay que dejarlas
          bien repartidas antes de que arranque la primera jornada. */}
      {divisionLock && (
        divisionLock.locked ? (
          <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-3 text-slate-600 text-sm font-medium">
            Divisiones cerradas: empezó la jornada {divisionLock.startingMatchday}. Ya no se puede mover a nadie de
            división — hacerlo recalcularía sanciones y pagos ya aplicados.
          </div>
        ) : (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3 text-amber-800 text-sm font-medium">
            Divisiones abiertas hasta el cierre del mercado de la jornada {divisionLock.startingMatchday}
            {divisionLock.lockAt
              ? ` (${new Date(divisionLock.lockAt).toLocaleString('es-ES', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })})`
              : ''}
            . Después quedan congeladas toda la temporada.
            {stats.unassigned > 0 && (
              <> Quedan <strong>{stats.unassigned}</strong> usuario(s) sin división: no aparecerán en ninguna
              clasificación ni entrarán en el reparto de pagos.</>
            )}
          </div>
        )
      )}

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Teléfono</th>
                <th className="px-4 py-3 font-semibold">Registro</th>
                <th className="px-4 py-3 font-semibold">División</th>
                <th className="px-4 py-3 font-semibold">Cuota Inicial</th>
                <th className="px-4 py-3 font-semibold">Sanciones</th>
                <th className="px-4 py-3 font-semibold">Dinero Actual</th>
                <th className="px-4 py-3 font-semibold">Fecha de pago</th>
                <th className="px-4 py-3 font-semibold">Cobrado por</th>
                <th className="px-4 py-3 font-semibold text-center">Estado</th>
                <th className="px-4 py-3 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">Cargando usuarios…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">No hay usuarios que coincidan.</td></tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{u.full_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{u.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDate(u.created_at)}</td>

                    {/* División (asignada por el admin) */}
                    <td className="px-4 py-3">
                      <select
                        value={u.division ?? ''}
                        disabled={savingId === u.id || Boolean(divisionLock?.locked)}
                        title={divisionLock?.locked ? 'Las divisiones se cerraron al empezar la primera jornada' : undefined}
                        onChange={(e) => {
                          const v = e.target.value === '' ? null : Number(e.target.value)
                          if (v !== (u.division ?? null)) saveUser(u.id, { division: v }).catch(() => {})
                        }}
                        className={`px-2 py-1.5 rounded-lg border-2 outline-none focus:border-emerald-500 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed ${
                          u.division ? 'border-slate-200 text-slate-700' : 'border-amber-200 text-amber-700 bg-amber-50'
                        }`}
                      >
                        <option value="">Sin asignar</option>
                        <option value="1">1ª División</option>
                        <option value="2">2ª División</option>
                        <option value="3">3ª División</option>
                      </select>
                    </td>

                    {/* Cuota inicial editable */}
                    <td className="px-4 py-3">
                      <div className="relative w-28">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">€</span>
                        <input
                          type="number" min="0" step="0.5"
                          defaultValue={u.entry_fee_paid || ''}
                          disabled={savingId === u.id}
                          onBlur={(e) => {
                            const val = e.target.value === '' ? 0 : Number(e.target.value)
                            if (val !== (u.entry_fee_paid || 0)) {
                              const patch: Partial<AdminUser> = { entry_fee_paid: val }
                              if (val > 0 && !u.has_paid) {
                                patch.has_paid = true
                                patch.paid_at = u.paid_at ?? new Date().toISOString()
                              } else if (val === 0 && u.has_paid) {
                                patch.has_paid = false
                                patch.paid_at = null
                              }
                              saveUser(u.id, patch).catch(() => {})
                            }
                          }}
                          placeholder="0"
                          className="w-full pl-6 pr-2 py-1.5 rounded-lg border-2 border-slate-200 outline-none focus:border-emerald-500 text-sm"
                        />
                      </div>
                    </td>

                    {/* Sanciones (readonly) */}
                    <td className="px-4 py-3">
                      <div className={`font-semibold ${-((u.amount_paid || 0) + (u.infraction_penalties || 0)) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {-((u.amount_paid || 0) + (u.infraction_penalties || 0)) < 0 ? '' : '+'}
                        {-((u.amount_paid || 0) + (u.infraction_penalties || 0)).toFixed(2)}€
                      </div>
                    </td>

                    {/* Dinero Actual (readonly) */}
                    <td className="px-4 py-3">
                      <div className={`font-bold ${((u.entry_fee_paid || 0) - (config.starting_balance ?? 45) - ((u.amount_paid || 0) + (u.infraction_penalties || 0))) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {((u.entry_fee_paid || 0) - (config.starting_balance ?? 45) - ((u.amount_paid || 0) + (u.infraction_penalties || 0))) < 0 ? '' : '+'}
                        {((u.entry_fee_paid || 0) - (config.starting_balance ?? 45) - ((u.amount_paid || 0) + (u.infraction_penalties || 0))).toFixed(2)}€
                      </div>
                    </td>

                    {/* Fecha de pago editable */}
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        value={toDateInput(u.paid_at)}
                        disabled={savingId === u.id}
                        onChange={(e) => {
                          const v = e.target.value
                          saveUser(u.id, { paid_at: v || null, ...(v ? { has_paid: true } : {}) }).catch(() => {})
                        }}
                        className="px-2 py-1.5 rounded-lg border-2 border-slate-200 outline-none focus:border-emerald-500 text-sm text-slate-600"
                      />
                    </td>

                    {/* Cobrado por editable */}
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        defaultValue={u.collected_by || ''}
                        disabled={savingId === u.id}
                        onBlur={(e) => {
                          const val = e.target.value.trim()
                          if (val !== (u.collected_by || '')) {
                            saveUser(u.id, { collected_by: val || null }).catch(() => {})
                          }
                        }}
                        placeholder="Nombre..."
                        className="w-28 px-2 py-1.5 rounded-lg border-2 border-slate-200 outline-none focus:border-emerald-500 text-sm"
                      />
                    </td>

                    {/* Estado (toggle) */}
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <button
                          onClick={() => togglePaid(u)}
                          disabled={savingId === u.id}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors disabled:opacity-60 ${
                            u.has_paid ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          }`}
                          title={u.has_paid ? 'Clic para marcar pendiente' : 'Clic para marcar como pagado'}
                        >
                          {u.has_paid ? (<><CheckCircle2 className="w-3.5 h-3.5" /> Pagado</>) : (<><XCircle className="w-3.5 h-3.5" /> Pendiente</>)}
                        </button>
                      </div>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setEditUser(u)}
                          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                          title="Editar datos"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteUser(u)}
                          className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                          title="Eliminar usuario"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center">
        Mostrando {filtered.length} de {users.length} usuarios. La cuenta de administración no aparece en esta lista.
      </p>

      {/* Configuración de las reglas del juego */}
      <LeagueConfigPanel onStateChange={(state) => handlePanelStateChange('league', state)} />

      {/* Configuración del sistema de premios */}
      <PrizesPanel users={users} onStateChange={(state) => handlePanelStateChange('prizes', state)} />

      {/* Configuración del sistema de puntuación */}
      <ScoringConfigPanel onStateChange={(state) => handlePanelStateChange('scoring', state)} />

      {/* Panel de Jugadores No Emparejados (Biwenger -> API) */}
      <UnmatchedPlayersPanel />

      {editUser && (
        <EditModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={async (patch) => {
            await saveUser(editUser.id, patch)
            setEditUser(null)
          }}
        />
      )}

      {deleteUser && (
        <DeleteModal
          user={deleteUser}
          onClose={() => setDeleteUser(null)}
          onDeleted={() => {
            onDeleted(deleteUser.id)
            setDeleteUser(null)
          }}
        />
      )}

      {pendingNavigation && (
        <ConfirmLeaveModal
          changes={Object.values(unsavedPanels).flatMap(p => p.description)}
          onCancel={() => setPendingNavigation(null)}
          onDiscard={() => {
            Object.values(unsavedPanels).forEach(p => p.discard())
            const nav = pendingNavigation
            setPendingNavigation(null)
            if (nav.type === 'push' && nav.href) {
              router.push(nav.href)
            } else if (nav.type === 'signout') {
              handleSignOut()
            }
          }}
          onSave={async () => {
            const changed = Object.values(unsavedPanels).filter(p => p.hasChanges)
            await Promise.all(changed.map(p => p.save()))
            const nav = pendingNavigation
            setPendingNavigation(null)
            if (nav.type === 'push' && nav.href) {
              router.push(nav.href)
            } else if (nav.type === 'signout') {
              handleSignOut()
            }
          }}
        />
      )}
    </div>
  )
}

/* ---------- Modal de edición de datos ---------- */
function EditModal({
  user, onClose, onSave,
}: {
  user: AdminUser
  onClose: () => void
  onSave: (patch: Partial<AdminUser>) => Promise<void>
}) {
  const [fullName, setFullName] = useState(user.full_name)
  const [email, setEmail] = useState(user.email)
  const [phone, setPhone] = useState(user.phone)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErr('')
    const patch: Partial<AdminUser> = {}
    if (fullName !== user.full_name) patch.full_name = fullName
    if (email.trim().toLowerCase() !== user.email) patch.email = email.trim().toLowerCase()
    if (phone !== user.phone) patch.phone = phone
    if (Object.keys(patch).length === 0) { onClose(); return }
    try {
      await onSave(patch)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo guardar')
      setSaving(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-slate-900">Editar usuario</h2>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nombre completo">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border-2 border-slate-200 outline-none focus:border-emerald-500" />
        </Field>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false}
            className="w-full px-3 py-2.5 rounded-lg border-2 border-slate-200 outline-none focus:border-emerald-500" />
        </Field>
        <Field label="Teléfono">
          <input value={phone} onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border-2 border-slate-200 outline-none focus:border-emerald-500" />
        </Field>
        {err && <p className="text-red-600 text-sm font-medium">{err}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border-2 border-slate-200 font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Overlay>
  )
}

/* ---------- Modal de eliminación con contraseña ---------- */
function DeleteModal({
  user, onClose, onDeleted,
}: {
  user: AdminUser
  onClose: () => void
  onDeleted: () => void
}) {
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setDeleting(true)
    setErr('')
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || 'No se pudo eliminar')
      }
      onDeleted()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo eliminar')
      setDeleting(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-red-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Eliminar usuario</h2>
      </div>
      <p className="text-sm text-slate-600 mb-4">
        Vas a eliminar de forma permanente a <strong>{user.full_name || user.email}</strong> ({user.email}),
        junto con su equipo y alineaciones. Esta acción <strong>no se puede deshacer</strong>.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Confirma con tu contraseña de administrador">
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoFocus placeholder="Tu contraseña"
            className="w-full px-3 py-2.5 rounded-lg border-2 border-slate-200 outline-none focus:border-red-500"
          />
        </Field>
        {err && <p className="text-red-600 text-sm font-medium">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border-2 border-slate-200 font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button type="submit" disabled={deleting || !password} className="flex-1 py-2.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50">
            {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
          </button>
        </div>
      </form>
    </Overlay>
  )
}

/* ---------- Helpers de UI ---------- */
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function StatCard({
  icon, label, value, color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: 'slate' | 'emerald' | 'amber'
}) {
  const colors = {
    slate: 'bg-slate-100 text-slate-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors[color]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 leading-none truncate">{value}</p>
        <p className="text-xs text-slate-500 mt-1">{label}</p>
      </div>
    </div>
  )
}

/* ---------- Modal de confirmación al salir con cambios sin guardar ---------- */
function ConfirmLeaveModal({
  changes, onCancel, onDiscard, onSave
}: {
  changes: string[]
  onCancel: () => void
  onDiscard: () => void
  onSave: () => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave()
    } catch (err) {
      setError('Error al guardar algunos cambios. Por favor, revísalos.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 border border-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4 text-amber-600">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Cambios sin guardar</h2>
        </div>

        <p className="text-sm text-slate-600 mb-4">
          Has realizado modificaciones en la configuración. Si sales ahora, perderás estos cambios:
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-60 overflow-y-auto mb-6">
          <ul className="space-y-2">
            {changes.map((change, idx) => (
              <li key={idx} className="text-xs text-slate-700 font-medium flex items-start gap-2">
                <span className="text-amber-500 font-bold select-none">•</span>
                <span>{change}</span>
              </li>
            ))}
          </ul>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm font-medium">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border-2 border-slate-200 font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Seguir editando
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onDiscard}
            className="flex-1 py-2.5 rounded-lg border-2 border-red-200 font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            Descartar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? 'Guardando...' : 'Guardar y salir'}
          </button>
        </div>
      </div>
    </div>
  )
}
