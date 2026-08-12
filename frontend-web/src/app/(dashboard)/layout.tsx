'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Trophy, Users, Calendar, LogOut, Home, CircleDot, Lock, Gauge, ShieldCheck, Menu, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useMatchdayLock } from '@/hooks/use-matchday-lock'
import { AuthGuard } from '@/components/layout/auth-guard'
import { NotificationBell } from '@/components/layout/notification-bell'
import { OnlineUsersMenu } from '@/components/layout/online-users-menu'

const navigation = [
  { name: 'Mi Equipo', href: '/dashboard', icon: Home },
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const supabase = createClient()
  const { isUnlockWindowOpen, timeUntilLock } = useMatchdayLock()
  const pathname = usePathname()
  
  const isFullWidth = pathname === '/admin'

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
    <div className="min-h-screen flex flex-col">
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
                (finaliza en {timeUntilLock})
              </span>
            )}
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className={`px-4 sm:px-6 lg:px-8 mx-auto ${isFullWidth ? 'max-w-[1600px]' : 'max-w-7xl'}`}>
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

            {/* Iconos centrados (Móvil) */}
            <div className="flex md:hidden items-center justify-center flex-1">
              <div className="flex items-center gap-3">
                <OnlineUsersMenu />
                <NotificationBell />
              </div>
            </div>

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

            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              {/* Iconos en la derecha (Desktop) */}
              <div className="hidden md:flex items-center gap-3">
                <OnlineUsersMenu />
                <NotificationBell />
              </div>
              
              <div className="h-6 w-px bg-slate-700 hidden sm:block"></div>
              <span className="text-sm font-medium text-slate-200 hidden sm:block">{userName}</span>
              
              {/* Salir (Desktop) */}
              <button
                onClick={handleSignOut}
                className="hidden sm:flex items-center space-x-2 p-2 sm:px-3 sm:py-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-all duration-200"
                title="Salir"
              >
                <LogOut className="h-5 w-5 sm:h-4 sm:w-4 group-hover:text-rose-400" />
                <span className="text-sm">Salir</span>
              </button>

              {/* Botón Hamburguesa (Móvil) - Queda solo a la derecha */}
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="md:hidden flex items-center justify-center p-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-all duration-200"
                title="Menú"
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className={`flex-1 w-full px-4 sm:px-6 lg:px-8 pt-3 pb-8 mx-auto ${isFullWidth ? 'max-w-[1600px]' : 'max-w-7xl'}`}>
        {children}
      </main>

      {/* Menú Lateral Desplegable Móvil */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden bg-slate-950/80 backdrop-blur-md flex justify-end transition-opacity duration-300">
          <div className="w-4/5 max-w-sm bg-slate-900 border-l border-slate-800 h-full flex flex-col p-6 shadow-2xl relative animate-in slide-in-from-right duration-250">
            {/* Botón Cerrar (X) arriba a la derecha */}
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                title="Cerrar"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Cabecera / Logos Centrados y más Grandes */}
            <div className="flex items-center justify-center pb-6 border-b border-slate-800 mb-6 gap-4">
              <div className="relative w-14 h-14">
                <Image
                  src="/icono_lliga.png"
                  alt="Logo"
                  fill
                  className="object-contain"
                />
              </div>
              <div className="relative w-20 h-20">
                <Image
                  src="/liga.png"
                  alt="Liga"
                  fill
                  className="object-contain"
                />
              </div>
            </div>

            {/* Info usuario */}
            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/80 mb-6">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Usuario</p>
              <p className="text-white font-bold text-lg mt-0.5 truncate">{userName || 'Manager LMV'}</p>
            </div>

            {/* Enlaces de navegación */}
            <nav className="flex-1 space-y-1.5 overflow-y-auto">
              {navItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center space-x-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/10'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span>{item.name}</span>
                  </Link>
                )
              })}
            </nav>

            {/* Botón Salir en el menú desplegable */}
            <div className="pt-6 border-t border-slate-800 mt-auto">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false)
                  handleSignOut()
                }}
                className="w-full flex items-center justify-center space-x-2 px-4 py-3.5 bg-rose-950/20 hover:bg-rose-900/30 border border-rose-900/40 hover:border-rose-900/60 rounded-xl text-sm font-semibold text-rose-400 transition-all"
              >
                <LogOut className="h-5 w-5 shrink-0" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AuthGuard>
  )
}
