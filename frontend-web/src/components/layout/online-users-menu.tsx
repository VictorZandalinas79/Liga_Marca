'use client'

import { useState, useEffect, useRef } from 'react'
import { Users } from 'lucide-react'
import { useOnlineUsers } from '@/hooks/use-online-users'

export function OnlineUsersMenu() {
  const usersOnline = useOnlineUsers()
  const onlineCount = usersOnline.length
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
          <span className="text-sm font-medium hidden sm:block">{onlineCount}</span>
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
