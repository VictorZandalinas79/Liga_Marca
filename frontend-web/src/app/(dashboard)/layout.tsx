'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Trophy, Users, Calendar, LogOut, Home, CircleDot, Lock, Gauge, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useMatchdayLock } from '@/hooks/use-matchday-lock'
import { AuthGuard } from '@/components/layout/auth-guard'
import { NotificationBell } from '@/components/layout/notification-bell'
import { OnlineUsersMenu } from '@/components/layout/online-users-menu'

const navigation = [
  { name: 'Inicio', href: '/dashboard', icon: Home },
  { name: 'Jugadores', href: '/jugadores', icon: Users },
  { name: 'Partidos', href: '/partidos', icon: CircleDot },
  { name: 'Jornada', href: '/jornada', icon: Calendar },
  { name: 'Clasificación', href: '/clasificacion', icon: Trophy },
  { name: 'Puntuación', href: '/puntuacion', icon: Gauge },
]

const adminNavItem = { name: 'Admin', href: '/admin', icon: ShieldCheck }

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [userName, setUserName] = useState<string>('')
  const [isAdmin, setIsAdmin] = useState(false)
  const supabase = createClient()
  const { isUnlockWindowOpen, timeUntilLock } = useMatchdayLock()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario')
        setIsAdmin(user.email?.toLowerCase() === 'vilafranca.fantasy2026@gmail.com')
      }
    }
    getUser()
  }, [])

  useEffect(() => {
    let sessionId: string | null = null

    const updateUserSession = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.log('[SESSION] No user found')
          return
        }

        const now = new Date().toISOString()

        if (!sessionId) {
          console.log('[SESSION] Creating new session for user:', user.id)
          const { data: newSession, error: insertError } = await supabase
            .from('user_sessions')
            .insert({
              user_id: user.id,
              started_at: now,
              last_activity_at: now
            })
            .select()

          console.log('[SESSION] Insert result:', { newSession, insertError })

          if (insertError) {
            console.error('[SESSION] Insert error:', {
              message: insertError.message,
              details: insertError.details,
              hint: insertError.hint,
              code: insertError.code,
              full: insertError
            })
            return
          }

          if (newSession && newSession.length > 0) {
            sessionId = newSession[0].id
            console.log('[SESSION] Session created:', sessionId)
          }
        } else {
          const { error: updateError } = await supabase
            .from('user_sessions')
            .update({ last_activity_at: now })
            .eq('id', sessionId)

          if (updateError) {
            console.error('[SESSION] Update error:', updateError)
          } else {
            console.log('[SESSION] Session updated:', sessionId)
          }
        }
      } catch (err) {
        console.error('[SESSION] Unexpected error:', err)
      }
    }

    updateUserSession()
    const interval = setInterval(updateUserSession, 30000)

    return () => {
      clearInterval(interval)
      if (sessionId) {
        console.log('[SESSION] Cleaning up session:', sessionId)
        supabase
          .from('user_sessions')
          .delete()
          .eq('id', sessionId)
          .then(() => console.log('[SESSION] Session deleted'))
      }
    }
  }, [supabase])

  const navItems = isAdmin ? [...navigation, adminNavItem] : navigation

  const handleSignOut = async () => {
    localStorage.removeItem('lmv:lastActivity')
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <AuthGuard>
    <div className="min-h-full">
      {/* Aviso de tramo de jornada */}
      {isUnlockWindowOpen && (
        <div className="bg-amber-400 border-b border-amber-500 py-2 px-4">
          <div className="flex items-center justify-center gap-2">
            <Lock className="h-4 w-4 text-amber-900 animate-pulse" />
            <span className="text-amber-900 font-bold text-sm animate-pulse">
              TRAMO DE JORNADA ABIERTO - NO SE PUEDEN REALIZAR CAMBIOS
            </span>
            {timeUntilLock && (
              <span className="text-amber-800 text-xs ml-2">
                (cierra en {timeUntilLock})
              </span>
            )}
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="flex items-center justify-between h-16">
            <Link href="/dashboard" className="flex items-center space-x-2 sm:space-x-3 group">
              <div className="relative w-9 h-9 sm:w-10 sm:h-10 transition-transform group-hover:scale-105">
                <Image
                  src="/icono_lliga.png"
                  alt="Liga Marca Vilafranca"
                  fill
                  className="object-contain"
                  sizes="40px"
                />
              </div>
              <span className="text-lg sm:text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 hidden sm:block">LMV</span>
              <div className="relative w-12 h-12 sm:w-14 sm:h-14 transition-transform group-hover:scale-105">
                <Image
                  src="/liga.png"
                  alt="Liga"
                  fill
                  className="object-contain"
                  sizes="56px"
                />
              </div>
            </Link>

            <nav className="hidden md:flex items-center space-x-1">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="flex items-center space-x-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-all duration-200"
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-2 sm:gap-4">
              <OnlineUsersMenu />
              <NotificationBell />
              <div className="h-6 w-px bg-slate-700 hidden sm:block"></div>
              <span className="text-sm font-medium text-slate-200 hidden sm:block">{userName}</span>
              <button
                onClick={handleSignOut}
                className="flex items-center space-x-2 p-2 sm:px-3 sm:py-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-all duration-200"
                title="Salir"
              >
                <LogOut className="h-5 w-5 sm:h-4 sm:w-4 group-hover:text-rose-400" />
                <span className="text-sm hidden sm:block">Salir</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navegación móvil inferior */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-around px-2 py-2">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="flex flex-col items-center space-y-1 p-2 rounded-xl text-slate-400 hover:text-white active:bg-slate-800 transition-all w-16"
            >
              <item.icon className="h-5 w-5 mb-0.5" />
              <span className="text-[10px] font-medium leading-tight truncate w-full text-center">{item.name}</span>
            </Link>
          ))}
        </div>
      </nav>

      <main className="px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8 max-w-7xl mx-auto">
        {children}
      </main>
    </div>
    </AuthGuard>
  )
}
