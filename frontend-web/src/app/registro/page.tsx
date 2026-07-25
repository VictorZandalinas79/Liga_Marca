'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { UserPlus, Mail, Lock, User, ArrowRight, Sparkles, Phone } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function RegistroPage() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [focusedInput, setFocusedInput] = useState<string | null>(null)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: nombre,
          phone: telefono,
        },
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (authData?.user) {
      const userId = authData.user.id
      try {
        // Dar un instante a que la sesión quede establecida tras el signUp
        await new Promise(resolve => setTimeout(resolve, 300))

        // Guardar el teléfono en el perfil (best-effort; requiere fila en profiles)
        const { error: phoneError } = await supabase
          .from('profiles')
          .update({ phone: telefono })
          .eq('id', userId)
        if (phoneError) console.warn('[REGISTRO] No se pudo guardar el teléfono:', phoneError.message)

        // 1. Equipo: reutilizar si ya existe (idempotente, evita duplicados)
        const { data: existingTeam } = await supabase
          .from('user_teams')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle()

        if (!existingTeam) {
          const { error: teamError } = await supabase
            .from('user_teams')
            .insert({ user_id: userId, name: nombre })
          if (teamError) throw teamError
        }

        // 2. El once inicial (11 jugadores) NO se genera aquí.
        //    Lo crea el dashboard en su primera carga, usando la MISMA jornada
        //    activa que lee de useMatchdayLock. Así evitamos:
        //      - que el registro guarde el equipo en una jornada distinta a la
        //        que el dashboard muestra (quedaban dos equipos descolocados), y
        //      - generar dos veces (carrera registro↔dashboard, agravada porque
        //        justo tras signUp la sesión/RLS puede no estar lista todavía).
        router.push('/dashboard')
      } catch (err: any) {
        console.error('[REGISTRO] Error creando el equipo:', err)
        setError('Error creando el equipo: ' + (err?.message || 'desconocido'))
      }
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Efectos de fondo animados */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-slate-500/10 rounded-full blur-3xl animate-pulse delay-700"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-600/5 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo y título mejorados */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="flex justify-center mb-4 relative">
            <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full"></div>
            <div className="relative w-28 h-28 md:w-32 md:h-32">
              <Image
                src="/icono_lliga.png"
                alt="Liga Marca Vilafranca"
                fill
                className="object-contain drop-shadow-2xl"
                priority
              />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Lliga Marca<span className="text-emerald-400"> Vilafranca</span>
          </h1>
          <p className="text-slate-300 text-sm md:text-base flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            Crea tu cuenta y comienza a competir
          </p>
        </div>

        {/* Tarjeta de registro mejorada */}
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-slate-200/50">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Crear cuenta</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Input Nombre con icono */}
            <div className="relative">
              <label htmlFor="nombre" className="block text-sm font-semibold text-slate-700 mb-2">
                Nombre
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  id="nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  onFocus={() => setFocusedInput('nombre')}
                  onBlur={() => setFocusedInput(null)}
                  className={`w-full pl-12 pr-4 py-3.5 rounded-xl border-2 transition-all duration-200 outline-none bg-slate-50 ${
                    focusedInput === 'nombre'
                      ? 'border-emerald-500 bg-white shadow-lg shadow-emerald-500/10'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  placeholder="Tu nombre"
                  required
                />
              </div>
            </div>

            {/* Input Email con icono */}
            <div className="relative">
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-2">
                Correo Electrónico
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedInput('email')}
                  onBlur={() => setFocusedInput(null)}
                  className={`w-full pl-12 pr-4 py-3.5 rounded-xl border-2 transition-all duration-200 outline-none bg-slate-50 ${
                    focusedInput === 'email'
                      ? 'border-emerald-500 bg-white shadow-lg shadow-emerald-500/10'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  placeholder="tu@email.com"
                  required
                />
              </div>
            </div>

            {/* Input Teléfono con icono */}
            <div className="relative">
              <label htmlFor="telefono" className="block text-sm font-semibold text-slate-700 mb-2">
                Teléfono
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Phone className="w-5 h-5" />
                </div>
                <input
                  type="tel"
                  id="telefono"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  onFocus={() => setFocusedInput('telefono')}
                  onBlur={() => setFocusedInput(null)}
                  className={`w-full pl-12 pr-4 py-3.5 rounded-xl border-2 transition-all duration-200 outline-none bg-slate-50 ${
                    focusedInput === 'telefono'
                      ? 'border-emerald-500 bg-white shadow-lg shadow-emerald-500/10'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  placeholder="600 123 456"
                  pattern="[0-9+\s]{6,15}"
                  title="Introduce un número de teléfono válido"
                  required
                />
              </div>
            </div>

            {/* Input Contraseña con icono */}
            <div className="relative">
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedInput('password')}
                  onBlur={() => setFocusedInput(null)}
                  className={`w-full pl-12 pr-4 py-3.5 rounded-xl border-2 transition-all duration-200 outline-none bg-slate-50 ${
                    focusedInput === 'password'
                      ? 'border-emerald-500 bg-white shadow-lg shadow-emerald-500/10'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  required
                />
              </div>
            </div>

            {/* Mensaje de error mejorado */}
            {error && (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 animate-shake">
                <p className="text-red-700 text-sm font-medium text-center">{error}</p>
              </div>
            )}

            {/* Botón mejorado con animación */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 text-white py-4 rounded-xl font-bold text-lg hover:from-emerald-700 hover:to-emerald-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 hover:-translate-y-0.5 flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Creando cuenta...
                </>
              ) : (
                <>
                  Registrarse
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Separador */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-slate-500">o</span>
            </div>
          </div>

          {/* Link de inicio de sesión mejorado */}
          <div className="text-center">
            <p className="text-slate-600 mb-3">
              ¿Ya tienes cuenta?
            </p>
            <button
              onClick={() => router.push('/')}
              className="w-full py-3 px-4 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 transition-all duration-200 hover:-translate-y-0.5"
            >
              Iniciar sesión
            </button>
          </div>
        </div>

        {/* Footer mejorado */}
        <footer className="text-center mt-8 text-slate-400 text-sm">
          <p>© 2026 LFM Vilafranca - Todos los derechos reservados</p>
        </footer>
      </div>

      {/* Añade estas animaciones en tu CSS global o tailwind.config.js */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        
        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }
        
        .animate-shake {
          animation: shake 0.3s ease-in-out;
        }
      `}</style>
    </div>
  )
}
