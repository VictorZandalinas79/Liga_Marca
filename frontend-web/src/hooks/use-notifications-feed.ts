'use client'

import { useSyncExternalStore, useCallback } from 'react'

export interface FeedNotification {
  id: string
  type: string
  title: string
  body: string
  created_at: string
  read_at: string | null
  player_photo?: string | null
  division?: number | null
}

/**
 * Feed de notificaciones compartido por todas las instancias de la campana.
 *
 * El layout monta <NotificationBell /> dos veces (móvil y escritorio, una
 * oculta por CSS pero montada) y cada una sondeaba /api/notifications por su
 * cuenta: dos peticiones idénticas en el mismo segundo, y el doble de CPU de
 * función en Vercel. Ahora hay un único sondeo por pestaña, con dedupe de
 * peticiones en vuelo y TTL, y el estado (leídos) se comparte entre instancias.
 */
const POLL_MS = 5 * 60 * 1000
const TTL_MS = 0

const EMPTY: FeedNotification[] = []
let current: FeedNotification[] = EMPTY
let lastFetched = 0
let inFlight: Promise<void> | null = null
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach(l => l())
}

function applyLocalReads(list: FeedNotification[]): FeedNotification[] {
  let readIds: string[] = []
  try {
    const stored = localStorage.getItem('read_notifications')
    if (stored) readIds = JSON.parse(stored)
  } catch {}
  if (readIds.length === 0) return list
  return list.map(n =>
    readIds.includes(n.id) ? { ...n, read_at: n.read_at || new Date().toISOString() } : n
  )
}

async function fetchFeed(force = false): Promise<void> {
  if (!force && Date.now() - lastFetched < TTL_MS) return
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        // /api/notifications ya consolida las notificaciones estándar, avisos de
        // partidos intercalados y sanciones (consolidadas y en vivo).
        current = applyLocalReads(data.notifications || [])
        lastFetched = Date.now()
        emit()
      }
    } catch {
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** Actualiza el feed compartido (marcar leídos) y avisa a todas las campanas. */
export function updateNotificationsFeed(
  updater: (prev: FeedNotification[]) => FeedNotification[]
) {
  current = updater(current)
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    fetchFeed()
    timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      fetchFeed(true)
    }, POLL_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

const getSnapshot = () => current
const getServerSnapshot = () => EMPTY

export function useNotificationsFeed() {
  const notifications = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const refresh = useCallback(() => fetchFeed(), [])
  return { notifications, refresh, setNotifications: updateNotificationsFeed }
}
