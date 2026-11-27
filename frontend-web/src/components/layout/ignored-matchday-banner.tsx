'use client'

import { Ban } from 'lucide-react'
import { useNotificationsFeed } from '@/hooks/use-notifications-feed'

/**
 * Aviso superior de jornada ignorada en el juego. Sale del mismo feed que la
 * campana (/api/notifications), que ya decide la ventana: desde 7 días antes
 * del primer partido de la jornada hasta que terminan todos sus partidos.
 */
export function IgnoredMatchdayBanner() {
  const { notifications } = useNotificationsFeed()
  const notices = notifications.filter(n => n.type === 'matchday_ignored')
  if (notices.length === 0) return null

  return (
    <div className="bg-rose-600 border-b border-rose-700 py-2 px-4">
      <div className="max-w-7xl mx-auto space-y-1">
        {notices.map(n => (
          <div key={n.id} className="flex items-start sm:items-center justify-center gap-2 text-white text-sm">
            <Ban className="h-4 w-4 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong className="font-bold uppercase">{n.title}:</strong> {n.body}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
