'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Users } from 'lucide-react'

export function OnlineUsersMenu() {
  const [usersOnline, setUsersOnline] = useState<Array<{ id: string; full_name: string }>>([])
  const [onlineCount, setOnlineCount] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const fetchOnlineUsers = async () => {
      try {
        const { data: sessions, error: sessionsError } = await supabase
          .from('user_sessions')
          .select('user_id, last_activity_at')
          .order('last_activity_at', { ascending: false })

        if (sessionsError) return

        if (sessions && sessions.length > 0) {
          const now = Date.now()
          const fiveMinutesAgo = now - (5 * 60 * 1000)

          const sessionIds = sessions
            .filter((s: any) => {
              if (!s.last_activity_at) return false
              const lastActivity = new Date(s.last_activity_at).getTime()
              return lastActivity > fiveMinutesAgo
            })
            .map((s: any) => s.user_id)

          if (sessionIds.length > 0) {
            const { data: profiles, error: profilesError } = await supabase
              .from('profiles')
              .select('id, full_name')
              .in('id', sessionIds)

            if (profilesError) return

            setUsersOnline(profiles || [])
            setOnlineCount(profiles?.length || 0)
          } else {
            setOnlineCount(0)
            setUsersOnline([])
          }
        } else {
          setOnlineCount(0)
          setUsersOnline([])
        }
      } catch (err) {
        console.error('[USUARIOS EN LÍNEA] Error:', err)
        setOnlineCount(0)
        setUsersOnline([])
      }
    }

    fetchOnlineUsers()
    const interval = setInterval(fetchOnlineUsers, 15000)
    return () => clearInterval(interval)
  }, [supabase])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        title="Usuarios en línea"
      >
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            {onlineCount > 0 ? (
              <>
                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-500"></span>
            )}
          </span>
          <span className="text-sm font-medium">{onlineCount}</span>
          <Users className="h-4 w-4" />
        </div>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-slate-800 rounded-lg shadow-lg border border-slate-700 z-50 py-2">
          <div className="px-4 py-2 border-b border-slate-700 mb-1">
            <h3 className="text-sm font-semibold text-white">En línea ahora</h3>
          </div>
          {usersOnline.length > 0 ? (
            <div className="max-h-60 overflow-y-auto">
              {usersOnline.map((u) => (
                <div key={u.id} className="px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/50 flex items-center gap-2">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  {u.full_name || 'Usuario'}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-2 text-sm text-slate-500">Nadie conectado</div>
          )}
        </div>
      )}
    </div>
  )
}
