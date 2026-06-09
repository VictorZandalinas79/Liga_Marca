'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Download, ShieldCheck, CheckCircle2, XCircle, Users, RefreshCw, Euro } from 'lucide-react'

type AdminUser = {
  id: string
  email: string
  full_name: string
  phone: string
  has_paid: boolean
  paid_at: string | null
  amount_paid: number
  created_at: string
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ISO/timestamp → 'YYYY-MM-DD' para el input date
function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

function formatEuro(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>('all')
  const [savingId, setSavingId] = useState<string | null>(null)

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  // Guarda cambios parciales (importe, fecha y/o estado) con actualización optimista.
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
      if (!res.ok) throw new Error('No se pudo guardar')
    } catch {
      setUsers((list) => list.map((u) => (u.id === id ? prev : u)))
      setError('No se pudo guardar el cambio')
    } finally {
      setSavingId(null)
    }
  }

  const togglePaid = (user: AdminUser) => {
    const next = !user.has_paid
    saveUser(user.id, {
      has_paid: next,
      paid_at: next ? user.paid_at ?? new Date().toISOString() : null,
    })
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (filter === 'paid' && !u.has_paid) return false
      if (filter === 'unpaid' && u.has_paid) return false
      if (!q) return true
      return (
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.phone.toLowerCase().includes(q)
      )
    })
  }, [users, search, filter])

  const stats = useMemo(() => {
    const paid = users.filter((u) => u.has_paid).length
    const collected = users.reduce((sum, u) => sum + (u.amount_paid || 0), 0)
    return { total: users.length, paid, unpaid: users.length - paid, collected }
  }, [users])

  const exportCsv = () => {
    const headers = ['Nombre', 'Email', 'Teléfono', 'Ha pagado', 'Importe (€)', 'Fecha de pago', 'Fecha de registro']
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
    const rows = filtered.map((u) =>
      [
        u.full_name,
        u.email,
        u.phone,
        u.has_paid ? 'Sí' : 'No',
        (u.amount_paid || 0).toFixed(2).replace('.', ','),
        formatDate(u.paid_at),
        formatDate(u.created_at),
      ]
        .map((v) => escape(String(v ?? '')))
        .join(',')
    )
    const csv = '﻿' + [headers.map(escape).join(','), ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `registrados_lmv_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
        <div className="flex bg-slate-100 rounded-xl p-1">
          {([
            ['all', 'Todos'],
            ['paid', 'Pagados'],
            ['unpaid', 'Pendientes'],
          ] as const).map(([key, label]) => (
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
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 text-red-700 text-sm font-medium">
          {error}
        </div>
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
                <th className="px-4 py-3 font-semibold">Importe (€)</th>
                <th className="px-4 py-3 font-semibold">Fecha de pago</th>
                <th className="px-4 py-3 font-semibold text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    Cargando usuarios…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    No hay usuarios que coincidan.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{u.full_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{u.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDate(u.created_at)}</td>

                    {/* Importe editable */}
                    <td className="px-4 py-3">
                      <div className="relative w-28">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">€</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          defaultValue={u.amount_paid || ''}
                          disabled={savingId === u.id}
                          onBlur={(e) => {
                            const val = e.target.value === '' ? 0 : Number(e.target.value)
                            if (val !== (u.amount_paid || 0)) saveUser(u.id, { amount_paid: val })
                          }}
                          placeholder="0"
                          className="w-full pl-6 pr-2 py-1.5 rounded-lg border-2 border-slate-200 outline-none focus:border-emerald-500 text-sm"
                        />
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
                          saveUser(u.id, {
                            paid_at: v || null,
                            ...(v ? { has_paid: true } : {}),
                          })
                        }}
                        className="px-2 py-1.5 rounded-lg border-2 border-slate-200 outline-none focus:border-emerald-500 text-sm text-slate-600"
                      />
                    </td>

                    {/* Estado (toggle) */}
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <button
                          onClick={() => togglePaid(u)}
                          disabled={savingId === u.id}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors disabled:opacity-60 ${
                            u.has_paid
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          }`}
                          title={u.has_paid ? 'Clic para marcar pendiente' : 'Clic para marcar como pagado'}
                        >
                          {u.has_paid ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Pagado
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5" /> Pendiente
                            </>
                          )}
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
        Mostrando {filtered.length} de {users.length} usuarios. La exportación incluye solo los filtrados.
      </p>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  color,
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
