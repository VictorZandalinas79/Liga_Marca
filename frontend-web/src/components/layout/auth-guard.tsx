'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Tiempo máximo de inactividad antes de exigir login de nuevo (5 minutos).
const IDLE_TIMEOUT_MS = 5 * 60 * 1000
const LAST_ACTIVITY_KEY = 'lmv:lastActivity'

// Eventos que cuentan como "actividad" del usuario.
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const

/**
 * Protege las rutas del dashboard:
 *  - Si no hay sesión, redirige al login.
 *  - Si la sesión lleva más de 5 minutos sin actividad, cierra sesión y exige
 *    volver a introducir correo y contraseña.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const supabase = createClient()
  const [ready, setReady] = useState(false)
  const loggingOut = useRef(false)

  useEffect(() => {
    let cancelled = false

    const forceLogout = async () => {
      if (loggingOut.current) return
      loggingOut.current = true
      try {
        localStorage.removeItem(LAST_ACTIVITY_KEY)
        await supabase.auth.signOut()
      } finally {
        window.location.href = '/'
      }
    }

    const markActivity = () => {
      localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString())
    }

    const isIdleExpired = () => {
      const raw = localStorage.getItem(LAST_ACTIVITY_KEY)
      if (!raw) return false
      const last = parseInt(raw, 10)
      if (Number.isNaN(last)) return false
      return Date.now() - last > IDLE_TIMEOUT_MS
    }

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      // Sin sesión → al login.
      if (!session) {
        if (!cancelled) await forceLogout()
        return
      }

      // Sesión existente pero caducada por inactividad → al login.
      if (isIdleExpired()) {
        if (!cancelled) await forceLogout()
        return
      }

      markActivity()
      if (!cancelled) setReady(true)
    }

    init()

    // Registrar actividad del usuario.
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, markActivity, { passive: true })
    )

    // Al volver a la pestaña, comprobar si ya caducó.
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && isIdleExpired()) {
        forceLogout()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Comprobación periódica de inactividad.
    const interval = setInterval(() => {
      if (isIdleExpired()) forceLogout()
    }, 30 * 1000)

    return () => {
      cancelled = true
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActivity))
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <p className="text-slate-400 text-sm">Cargando...</p>
      </div>
    )
  }

  return <>{children}</>
}
