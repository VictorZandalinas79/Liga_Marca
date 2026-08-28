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
  player_photo?: string | null
  division?: number | null
}

type Tab = 'partidos' | 'jugadores' | 'sanciones'

/**
 * Notificaciones que la API calcula al vuelo (sanciones en vivo, bloqueos por
 * partido intercalado): no tienen fila en base de datos, así que su estado de
 * leído se guarda en localStorage.
 */
const DERIVED_ID_PREFIXES = ['penalty-', 'live-inf-', 'locked-fx-']
const isDerived = (id: string | number) => DERIVED_ID_PREFIXES.some(p => String(id).startsWith(p))

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('partidos')
  const [mounted, setMounted] = useState(false)

  const isSancion = (n: Notification) => String(n.id).startsWith('penalty-') || String(n.id).startsWith('live-inf-')
  const isPartido = (n: Notification) => !isSancion(n) && (n.type === 'fixture_changed' || n.type === 'players_locked' || String(n.id).startsWith('locked-fx-'))
  const isJugador = (n: Notification) => !isPartido(n) && !isSancion(n)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    setMounted(true)
  }, [])

  async function handleCopy(e: React.MouseEvent, text: string, id: string, photoUrl?: string | null) {
    e.stopPropagation()
    const plainText = photoUrl ? `${text}\n${photoUrl}` : text
    
    try {
      if (photoUrl && navigator.clipboard && window.isSecureContext && typeof window.ClipboardItem !== 'undefined') {
        const htmlText = `<p>${text.replace(/\n/g, '<br>')}</p><br><img src="${photoUrl}" alt="Photo" />`
        const clipboardItem = new ClipboardItem({
          "text/html": new Blob([htmlText], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        })
        await navigator.clipboard.write([clipboardItem])
      } else {
        await fallbackCopyTextToClipboard(plainText)
      }
    } catch (err) {
      console.error('Failed to copy: ', err)
      await fallbackCopyTextToClipboard(plainText)
    }
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleCopyAll() {
    if (notifications.length === 0) return
    
    const plainText = notifications.map(n => {
      let msg = `📢 *${n.title}*\n${n.body}`
      if (n.player_photo) msg += `\n${n.player_photo}`
      return msg
    }).join('\n\n')
    
    const hasAnyPhoto = notifications.some(n => n.player_photo)
    
    try {
      if (hasAnyPhoto && navigator.clipboard && window.isSecureContext && typeof window.ClipboardItem !== 'undefined') {
        const htmlParts = notifications.map(n => {
          let part = `<p>📢 <strong>${n.title}</strong><br>${n.body}</p>`
          if (n.player_photo) {
            part += `<br><img src="${n.player_photo}" alt="Photo" />`
          }
          return part
        })
        const htmlText = htmlParts.join('<hr>')
        
        const clipboardItem = new ClipboardItem({
          "text/html": new Blob([htmlText], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        })
        await navigator.clipboard.write([clipboardItem])
      } else {
        await fallbackCopyTextToClipboard(plainText)
      }
    } catch (err) {
      console.error('Failed to copy all: ', err)
      await fallbackCopyTextToClipboard(plainText)
    }
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  async function fallbackCopyTextToClipboard(text: string) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text)
        return
      } catch (err) {
        // Fallthrough
      }
    }
    const textArea = document.createElement("textarea")
    textArea.value = text
    textArea.style.position = "fixed"
    textArea.style.left = "-999999px"
    textArea.style.top = "-999999px"
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    try {
      document.execCommand('copy')
    } catch (err) {
      console.error('Fallback execCommand failed', err)
    }
    textArea.remove()
  }

  const unreadCount = notifications.filter(n => !n.read_at).length

  useEffect(() => {
    fetchNotifications()
    // Antes solo se cargaba una vez al montar: si la pestaña llevaba abierta
    // desde antes de que se cerrara el periodo de cambios de una jornada, la
    // sanción nunca aparecía sin recargar la página a mano. Refrescamos cada
    // 2 minutos para que las sanciones en vivo aparezcan solas al cerrarse.
    const interval = setInterval(fetchNotifications, 120000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const modal = document.getElementById('notification-modal')
      if (ref.current && !ref.current.contains(e.target as Node) && !(modal && modal.contains(e.target as Node))) {
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
        // Excluir las sanciones que venían del API de notificaciones (penalties/live-inf)
        // porque ahora las obtenemos directamente de /api/penalties/live
        const rawNotifs = (data.notifications || []).filter(
          (n: any) => !String(n.id).startsWith('penalty-') && !String(n.id).startsWith('live-inf-')
        )

        // Obtener sanciones directamente de /api/penalties/live para TODAS las
        // divisiones, el mismo endpoint que usa la página de Jornada.
        let sanctionNotifs: Notification[] = []
        try {
          const divResults = await Promise.all(
            [1, 2, 3].map(async (div) => {
              const r = await fetch(`/api/penalties/live?division=${div}`, { cache: 'no-store' })
              if (!r.ok) return []
              const d = await r.json()
              return (d.infractions || []).map((inf: any) => ({
                id: `live-inf-${inf.id || `${div}-${inf.user_id}-${inf.description}`}`,
                type: 'players_locked' as NotificationType,
                title: `Sanción en Juego J${inf.matchday}: ${inf.full_name}`,
                body: `${inf.description} (Puntuarán 0 pts esta jornada)`,
                created_at: new Date().toISOString(),
                read_at: null,
                division: div,
              }))
            })
          )
          sanctionNotifs = divResults.flat()
        } catch (e) {
          console.error('Error fetching live sanctions:', e)
        }

        const allNotifs = [...sanctionNotifs, ...rawNotifs]

        // Cargar IDs leídos localmente
        let readIds: string[] = []
        try {
          const stored = localStorage.getItem('read_notifications')
          if (stored) readIds = JSON.parse(stored)
        } catch {}

        // Mapear combinando read_at de la base de datos y de localStorage
        const processed = allNotifs.map((n: Notification) => {
          if (readIds.includes(n.id)) {
            return { ...n, read_at: n.read_at || new Date().toISOString() }
          }
          return n
        })

        // Sin filtro por fecha: la tabla solo contiene ya las novedades de la
        // última sincronización, porque los scripts la vacían al empezar. El
        // corte de 5 días que había aquí solo servía para dejar la campana en
        // blanco si el workflow se retrasaba.
        setNotifications(processed)
      }
    } catch {}
  }

  useEffect(() => {
    if (open) {
      const unreadInTab = notifications.filter(n => !n.read_at && (
        activeTab === 'partidos' ? isPartido(n) :
        activeTab === 'jugadores' ? isJugador(n) :
        isSancion(n)
      ))
      if (unreadInTab.length > 0) {
        markTabRead(activeTab)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeTab, notifications])

  async function markTabRead(tab: Tab) {
    const unreadInTab = notifications.filter(n => !n.read_at && (
      tab === 'partidos' ? isPartido(n) :
      tab === 'jugadores' ? isJugador(n) :
      isSancion(n)
    ))

    if (unreadInTab.length === 0) return

    const now = new Date().toISOString()
    const currentIds = unreadInTab.map(n => n.id)
    const dbIds = currentIds.filter(id => !isDerived(id))

    // 1. Guardar en localStorage para persistencia rápida y derivadas
    try {
      let readIds: string[] = []
      const stored = localStorage.getItem('read_notifications')
      if (stored) readIds = JSON.parse(stored)
      const newReadIds = Array.from(new Set([...readIds, ...currentIds]))
      localStorage.setItem('read_notifications', JSON.stringify(newReadIds))
    } catch {}

    // 2. Marcar en estado local inmediatamente
    setNotifications(prev =>
      prev.map(n => currentIds.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)
    )

    // 3. Notificaciones estándar en base de datos
    if (dbIds.length > 0) {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: dbIds }),
      })
    }
  }

  async function markRead(id: string) {
    // Guardar SIEMPRE en localStorage para asegurar que no vuelva a salir como no leído
    try {
      let readIds: string[] = []
      const stored = localStorage.getItem('read_notifications')
      if (stored) readIds = JSON.parse(stored)
      if (!readIds.includes(id)) {
        readIds.push(id)
        localStorage.setItem('read_notifications', JSON.stringify(readIds))
      }
    } catch {}

    if (!isDerived(id)) {
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
          <div id="notification-modal" className="relative w-full max-w-2xl bg-white border border-slate-300 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Cabecera del modal */}
            <div className="flex flex-col border-b border-slate-200 bg-slate-900 shrink-0">
              <div className="flex items-center justify-between px-6 py-4">
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

              {/* Tabs */}
              <div className="flex bg-slate-800">
                {(['partidos', 'jugadores', 'sanciones'] as Tab[]).map(tab => {
                  const unreadInTab = notifications.filter(n => !n.read_at && (
                    tab === 'partidos' ? isPartido(n) :
                    tab === 'jugadores' ? isJugador(n) :
                    isSancion(n)
                  )).length
                  
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 py-3 text-sm font-bold capitalize transition-colors flex items-center justify-center gap-2 relative ${
                        activeTab === tab
                          ? 'text-white bg-slate-700/50 border-b-2 border-blue-400'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                      }`}
                    >
                      {tab}
                      {unreadInTab > 0 && (
                        <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">
                          {unreadInTab}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Lista de notificaciones (scrollable) */}
            <div className="overflow-y-auto p-4 sm:p-6 bg-slate-50 flex-1">
              {(() => {
                const filtered = notifications.filter(n => {
                  if (activeTab === 'partidos') return isPartido(n)
                  if (activeTab === 'jugadores') return isJugador(n)
                  if (activeTab === 'sanciones') return isSancion(n)
                  return false
                })

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12">
                      <p className="text-slate-400 text-sm font-medium">Sin notificaciones en esta sección</p>
                    </div>
                  )
                }

                const renderNotificationCard = (n: Notification) => {
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
                          {n.player_photo ? (
                            <img src={n.player_photo} alt="Player" className="w-10 h-10 rounded-full object-cover shrink-0 shadow-sm border border-slate-200" />
                          ) : (
                            <span className="text-2xl shrink-0 drop-shadow-sm">{typeIcon[n.type] ?? '🔔'}</span>
                          )}
                          <div className="flex-1 min-w-0 pr-8">
                            <div className="flex items-center gap-2 mb-1">
                              <p className={`font-bold ${isWarning ? 'text-red-900' : 'text-slate-900'}`}>{n.title}</p>
                              {!n.read_at && (
                                <span className={`h-2.5 w-2.5 rounded-full shrink-0 shadow-sm ${isWarning ? 'bg-red-500' : 'bg-blue-500'}`} />
                              )}
                            </div>
                            <p className={`text-sm mt-1 leading-snug ${isWarning ? 'text-red-800' : 'text-slate-700'}`}>{n.body}</p>
                            <p className="text-xs text-slate-500 mt-2 font-medium">{formatDate(n.created_at)}</p>
                          </div>
                          <button
                            onClick={(e) => handleCopy(e, `📢 *${n.title}*\n${n.body}`, n.id, n.player_photo)}
                            className="absolute top-0 right-0 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-md transition-all z-10"
                            title="Copiar para WhatsApp"
                          >
                            {copiedId === n.id ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                    </div>
                  )
                }

                return (
                  <div className="space-y-4">
                    {activeTab === 'sanciones' ? (() => {
                      const grouped = filtered.reduce((acc, n) => {
                        const div = n.division != null ? `División ${n.division}` : 'General'
                        if (!acc[div]) acc[div] = []
                        acc[div].push(n)
                        return acc
                      }, {} as Record<string, Notification[]>)

                      const sortedDivisions = Object.keys(grouped).sort((a, b) => {
                        if (a === 'General') return 1
                        if (b === 'General') return -1
                        return a.localeCompare(b)
                      })

                      return (
                        <div className="space-y-6">
                          {sortedDivisions.map(div => (
                            <div key={div}>
                              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">{div}</h3>
                              <div className="space-y-4">
                                {grouped[div].map(renderNotificationCard)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })() : (
                      filtered.map(renderNotificationCard)
                    )}
                    {filtered.some(n => !n.read_at) && (
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
                )
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
