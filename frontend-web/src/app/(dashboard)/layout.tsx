'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Trophy, Users, Calendar, LogOut, Home, CircleDot, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useMatchdayLock } from '@/hooks/use-matchday-lock'

const navigation = [
  { name: 'Inicio', href: '/dashboard', icon: Home },
  { name: 'Jugadores', href: '/jugadores', icon: Users },
  { name: 'Partidos', href: '/partidos', icon: CircleDot },
  { name: 'Jornada', href: '/jornada', icon: Calendar },
  { name: 'Clasificación', href: '/clasificacion', icon: Trophy },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [userName, setUserName] = useState<string>('')
  const supabase = createClient()
  const { isUnlockWindowOpen, timeUntilLock } = useMatchdayLock()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario')
      }
    }
    getUser()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
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
              <div className="relative w-32 h-32">
                <Image
                  src="/liga.png"
                  alt="Liga"
                  fill
                  className="object-contain"
                  sizes="128px"
                />
              </div>
            </Link>

            <nav className="hidden md:flex items-center space-x-4">
              {navigation.map((item) => (
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

            <div className="flex items-center gap-4">
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
            {navigation.map((item) => (
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
  )
}
