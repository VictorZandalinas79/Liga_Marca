'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Bell, Copy, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type NotificationType =
  | 'fixture_changed'
  | 'new_player'
  | 'sync_complete'
  | 'players_locked'
  | 'squad_changed'
  | 'position_changed'
  | 'team_changed'
  | 'photo_changed'
  | 'transfer'
  | 'unmatched'
  | 'provisional_player'
  | 'player_promoted'

interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string
  created_at: string
  read_at: string | null
}

/**
 * Notificaciones que la API calcula al vuelo (sanciones en vivo, bloqueos por
 * partido intercalado): no tienen fila en base de datos, así que su estado de
 * leído se guarda en localStorage.
 */
const DERIVED_ID_PREFIXES = ['penalty-', 'live-inf-', 'locked-fx-']
const isDerived = (id: string) => DERIVED_ID_PREFIXES.some(p => id.startsWith(p))

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    setMounted(true)
  }, [])

  function handleCopy(e: React.MouseEvent, text: string, id: string) {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function handleCopyAll() {
    if (notifications.length === 0) return
    const text = notifications.map(n => `📢 *${n.title}*\n${n.body}`).join('\n\n')
    navigator.clipboard.writeText(text)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  const unreadCount = notifications.filter(n => !n.read_at).length

  useEffect(() => {
    fetchNotifications()
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function fetchNotifications() {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        const rawNotifs = data.notifications || []

        // Cargar IDs leídos localmente
        let readIds: string[] = []
        try {
          const stored = localStorage.getItem('read_notifications')
          if (stored) readIds = JSON.parse(stored)
        } catch {}

        // Mapear combinando read_at de la base de datos y de localStorage
        const processed = rawNotifs.map((n: Notification) => {
          if (readIds.includes(n.id)) {
            return { ...n, read_at: n.read_at || new Date().toISOString() }
          }
          return n
        })

        // Filtrar notificaciones para mostrar solo las de los últimos 5 días
        const fiveDaysAgo = new Date()
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)
        
        const recentNotifications = processed.filter((n: Notification) => {
          return new Date(n.created_at) >= fiveDaysAgo
        })

        setNotifications(recentNotifications)
      }
    } catch {}
  }

  async function markRead(id: string) {
    if (isDerived(id)) {
      // Guardar en localStorage las dinámicas que no están en sync_notifications
      try {
        let readIds: string[] = []
        const stored = localStorage.getItem('read_notifications')
        if (stored) readIds = JSON.parse(stored)
        if (!readIds.includes(id)) {
          readIds.push(id)
          localStorage.setItem('read_notifications', JSON.stringify(readIds))
        }
      } catch {}
    } else {
      // Notificación estándar en base de datos
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    }

    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)
    )
  }

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    // Guardar todos los IDs actuales en localStorage
    const currentIds = notifications.map(n => n.id)
    try {
      let readIds: string[] = []
      const stored = localStorage.getItem('read_notifications')
      if (stored) readIds = JSON.parse(stored)
      const newReadIds = Array.from(new Set([...readIds, ...currentIds]))
      localStorage.setItem('read_notifications', JSON.stringify(newReadIds))
    } catch {}

    setNotifications(prev =>
      prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
    )
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const typeIcon: Record<string, string> = {
    fixture_changed: '📅',
    new_player: '🆕',
    sync_complete: '✅',
    players_locked: '🔒',
    squad_changed: '🔄',
    position_changed: '🧭',
    team_changed: '🔁',
    photo_changed: '📸',
    transfer: '⚽',
    unmatched: '⚠️',
    provisional_player: '🕓',
    player_promoted: '✅',
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-slate-300 hover:text-white transition-colors"
        aria-label="Notificaciones"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Fondo oscuro para el modal */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          
          {/* Contenedor principal del modal */}
          <div className="relative w-full max-w-2xl bg-white border border-slate-300 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Cabecera del modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 shrink-0">
              <div className="flex items-center gap-4">
                <span className="font-bold text-white text-lg">📢 Notificaciones</span>
                {notifications.length > 0 && (
                  <button
                    onClick={handleCopyAll}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/80 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-md transition-colors"
                    title="Copiar todas para WhatsApp"
                  >
                    {copiedAll ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    {copiedAll ? '¡Copiado!' : 'Copiar todo'}
                  </button>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Lista de notificaciones (scrollable) */}
            <div className="overflow-y-auto p-4 sm:p-6 bg-slate-50 flex-1">
              {notifications.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-400 text-sm font-medium">Sin notificaciones</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {notifications.map(n => {
                    const isWarning = n.type.includes('lock') || n.type === 'unmatched' || n.body.includes('multa') || n.body.includes('sanción')
                    return (
                      <div
                        key={n.id}
                        onClick={() => !n.read_at && markRead(n.id)}
                        className={`p-4 rounded-xl border-2 transition-all shadow-sm ${
                          !n.read_at ? 'cursor-pointer hover:border-slate-400 hover:shadow-md' : ''
                        } ${
                          isWarning
                            ? '!bg-red-50/80 border-red-300'
                            : !n.read_at
                              ? 'bg-blue-50/80 border-blue-300'
                              : 'bg-white border-slate-200'
                        }`}
                        title={!n.read_at ? 'Hacer clic para marcar como leído' : undefined}
                      >
                        <div className="flex items-start gap-4 relative">
                          <span className="text-2xl shrink-0 drop-shadow-sm">{typeIcon[n.type] ?? '🔔'}</span>
                          <div className="flex-1 min-w-0 pr-8">
                            <div className="flex items-center gap-2 mb-1">
                              <p className={`font-bold truncate ${isWarning ? 'text-red-900' : 'text-slate-900'}`}>{n.title}</p>
                              {!n.read_at && (
                                <span className={`h-2.5 w-2.5 rounded-full shrink-0 shadow-sm ${isWarning ? 'bg-red-500' : 'bg-blue-500'}`} />
                              )}
                            </div>
                            <p className={`text-sm mt-1 leading-snug ${isWarning ? 'text-red-800' : 'text-slate-700'}`}>{n.body}</p>
                            <p className="text-xs text-slate-500 mt-2 font-medium">{formatDate(n.created_at)}</p>
                          </div>
                          <button
                            onClick={(e) => handleCopy(e, `📢 *${n.title}*\n${n.body}`, n.id)}
                            className="absolute top-0 right-0 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-md transition-all z-10"
                            title="Copiar para WhatsApp"
                          >
                            {copiedId === n.id ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {unreadCount > 0 && (
                    <div className="pt-2">
                      <button
                        onClick={markAllRead}
                        className="w-full px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-bold transition-colors text-sm shadow-sm"
                      >
                        Marcar todo como leído
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
