'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'

interface Notification {
  id: string
  type: 'fixture_changed' | 'new_player' | 'sync_complete' | 'players_locked'
  title: string
  body: string
  created_at: string
  read_at: string | null
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
      }
    } catch {}
  }

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
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
    new_player: '⚽',
    sync_complete: '✅',
    players_locked: '🔒',
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

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-2xl bg-white border border-slate-300 rounded-2xl shadow-2xl z-50">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800">
            <span className="font-bold text-white text-lg">📢 Notificaciones</span>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-200 transition-colors text-2xl"
            >
              ×
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto p-6">
            {notifications.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-400 text-sm">Sin notificaciones</p>
              </div>
            ) : (
              <div className="space-y-4">
                {notifications.map(n => {
                  const isWarning = n.type.includes('lock') || n.body.includes('multa') || n.body.includes('sanción')
                  return (
                    <div
                      key={n.id}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        isWarning
                          ? '!bg-red-50 border-red-300'
                          : !n.read_at
                            ? 'bg-blue-50 border-blue-300'
                            : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl shrink-0">{typeIcon[n.type] ?? '🔔'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className={`font-bold truncate ${isWarning ? 'text-red-900' : 'text-slate-900'}`}>{n.title}</p>
                            {!n.read_at && (
                              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${isWarning ? 'bg-red-500' : 'bg-blue-500'}`} />
                            )}
                          </div>
                          <p className={`text-sm mt-1 leading-snug ${isWarning ? 'text-red-800' : 'text-slate-700'}`}>{n.body}</p>
                          <p className="text-xs text-slate-500 mt-2">{formatDate(n.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="w-full mt-6 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-medium transition-colors text-sm"
                  >
                    Marcar todo como leído
                  </button>
                )}
              </div>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  )
}
