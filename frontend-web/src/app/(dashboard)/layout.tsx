'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Trophy, Users, Calendar, LogOut, Home, CircleDot, Lock, Gauge, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useMatchdayLock } from '@/hooks/use-matchday-lock'
import { AuthGuard } from '@/components/layout/auth-guard'
import { NotificationBell } from '@/components/layout/notification-bell'

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
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .maybeSingle()
        setIsAdmin(Boolean(profile?.is_admin))
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
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
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

      <header className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/dashboard" className="flex items-center space-x-2">
              <div className="relative w-10 h-10">
                <Image
                  src="/icono_lliga.png"
                  alt="Liga Marca Vilafranca"
                  fill
                  className="object-contain"
                  sizes="40px"
                />
              </div>
              <span className="text-xl font-bold text-white">LMV</span>
              <div className="relative w-16 h-16">
                <Image
                  src="/liga.png"
                  alt="Liga"
                  fill
                  className="object-contain"
                  sizes="64px"
                />
              </div>
            </Link>

            <nav className="hidden md:flex items-center space-x-4">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <NotificationBell />
              <span className="text-sm text-slate-300">{userName}</span>
              <button
                onClick={handleSignOut}
                className="flex items-center space-x-2 text-slate-300 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                <span className="text-sm">Salir</span>
              </button>
            </div>
          </div>

          <nav className="md:hidden flex items-center justify-between pb-4 overflow-x-auto">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="flex flex-col items-center space-y-1 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
    </AuthGuard>
  )
}
