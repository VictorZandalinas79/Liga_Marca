'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, AlertTriangle, Gauge, RefreshCw } from 'lucide-react'

type Alert = { level: 'warning' | 'critical'; area: string; message: string }

type UsageReport = {
  generated_at: string
  database: { bytes: number; limit_bytes: number }
  storage: { bytes: number; files: number; limit_bytes: number }
  users: { total: number; mau: number; limit: number }
  tables: { schema: string; name: string; total_bytes: number; index_bytes: number; rows: number; dead_rows: number }[]
  queries: { since: string | null; top: { query: string; calls: number; total_ms: number; mean_ms: number; rows: number }[] }
  logs: { table: string; rows: number; total_bytes: number; oldest: string | null; cleanup_sql: string }[]
  alerts: Alert[]
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('es-ES') : '—'
}

function UsageBar({ label, value, limit, display }: { label: string; value: number; limit: number; display: string }) {
  const pct = limit > 0 ? Math.min(100, (100 * value) / limit) : 0
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">{display} · {pct.toFixed(1)}%</span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function UsagePanel() {
  const [report, setReport] = useState<UsageReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadReport = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/usage')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar el consumo')
      setReport(data.report)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReport()
  }, [])

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center">
            <Gauge className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Consumo Supabase (plan Free)</h2>
            <p className="text-sm text-slate-500">
              Qué ocupa y qué consume la base de datos frente a los límites gratuitos.
            </p>
          </div>
        </div>
        <button
          onClick={loadReport}
          disabled={loading}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
          title="Actualizar"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border-b border-red-100 flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {loading && !report ? (
        <div className="px-5 py-8 text-center text-slate-400 text-sm">Cargando...</div>
      ) : report && (
        <div className="p-5 space-y-6">
          {report.alerts.length > 0 ? (
            <div className="space-y-2">
              {report.alerts.map((a, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-xl text-sm flex gap-2 ${
                    a.level === 'critical' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="break-words min-w-0">{a.message}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 rounded-xl text-sm bg-emerald-50 text-emerald-700">
              Todo dentro de márgenes. Sin avisos.
            </div>
          )}

          <div className="space-y-4">
            <UsageBar
              label="Base de datos"
              value={report.database.bytes}
              limit={report.database.limit_bytes}
              display={`${formatBytes(report.database.bytes)} / 500 MB`}
            />
            <UsageBar
              label={`Storage (${report.storage.files} archivos)`}
              value={report.storage.bytes}
              limit={report.storage.limit_bytes}
              display={`${formatBytes(report.storage.bytes)} / 1 GB`}
            />
            <UsageBar
              label={`Usuarios activos 30 días (${report.users.total} registrados)`}
              value={report.users.mau}
              limit={report.users.limit}
              display={`${report.users.mau} / 50.000`}
            />
            <p className="text-xs text-slate-400">
              El egress (5 GB/mes de datos servidos) no se puede medir desde la base de datos: consúltalo en el
              dashboard de Supabase → Organization → Usage.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-2">Logs que crecen solos</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-500 text-xs uppercase tracking-wide">
                    <th className="px-3 py-2 font-semibold">Tabla</th>
                    <th className="px-3 py-2 font-semibold text-right">Filas</th>
                    <th className="px-3 py-2 font-semibold text-right">Tamaño</th>
                    <th className="px-3 py-2 font-semibold">Más antiguo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.logs.map((l) => (
                    <tr key={l.table}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{l.table}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{l.rows.toLocaleString('es-ES')}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{formatBytes(l.total_bytes)}</td>
                      <td className="px-3 py-2 text-slate-500 text-xs">{formatDate(l.oldest)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-2">Tablas más pesadas</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-500 text-xs uppercase tracking-wide">
                    <th className="px-3 py-2 font-semibold">Tabla</th>
                    <th className="px-3 py-2 font-semibold text-right">Filas</th>
                    <th className="px-3 py-2 font-semibold text-right">Total</th>
                    <th className="px-3 py-2 font-semibold text-right">Índices</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.tables.map((t) => (
                    <tr key={`${t.schema}.${t.name}`}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{t.schema}.{t.name}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{t.rows.toLocaleString('es-ES')}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{formatBytes(t.total_bytes)}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{formatBytes(t.index_bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Consultas que más tiempo consumen</h3>
            <p className="text-xs text-slate-400 mb-2">Acumulado desde {formatDate(report.queries.since)}</p>
            {report.queries.top.length === 0 ? (
              <p className="text-sm text-slate-400">pg_stat_statements no está disponible.</p>
            ) : (
              <div className="space-y-2">
                {report.queries.top.map((q, i) => (
                  <div key={i} className="p-3 bg-slate-50 rounded-xl">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-1">
                      <span><b className="text-slate-700">{q.calls.toLocaleString('es-ES')}</b> llamadas</span>
                      <span><b className="text-slate-700">{(q.total_ms / 1000).toFixed(0)} s</b> en total</span>
                      <span>{q.mean_ms} ms de media</span>
                    </div>
                    <code className="block text-xs text-slate-600 break-all">{q.query}</code>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400 text-right">Generado {formatDate(report.generated_at)}</p>
        </div>
      )}
    </div>
  )
}
