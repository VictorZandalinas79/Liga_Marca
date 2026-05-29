'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function RegistroPage() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
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
        },
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Crear equipo y asignar 11 jugadores aleatorios
    if (authData?.user) {
      // 1. Crear equipo del usuario con el nombre del usuario
      const { data: teamData, error: teamError } = await supabase
        .from('user_teams')
        .insert({ user_id: authData.user.id, name: nombre })
        .select('id')
        .single()

      if (teamError) {
        console.error('Error creando equipo:', teamError)
      } else if (teamData) {
        // 2. Obtener jugadores disponibles agrupados por posición
        const { data: playersData } = await supabase
          .from('players')
          .select('id, position')
          .order('precio', { ascending: false })

        if (playersData) {
          const goalkeepers = playersData.filter(p => p.position?.toLowerCase().includes('goalkeeper'))
          const defenders = playersData.filter(p => p.position?.toLowerCase().includes('defender'))
          const midfielders = playersData.filter(p => p.position?.toLowerCase().includes('midfielder'))
          const forwards = playersData.filter(p => p.position?.toLowerCase().includes('forward') || p.position?.toLowerCase().includes('attacker'))

          const shuffle = (arr: any[]) => arr.sort(() => Math.random() - 0.5)

          // Seleccionar 11 aleatorios: 1 GK, 4 DEF, 4 MID, 3 FWD
          const selected = [
            ...shuffle(goalkeepers).slice(0, 1),
            ...shuffle(defenders).slice(0, 4),
            ...shuffle(midfielders).slice(0, 4),
            ...shuffle(forwards).slice(0, 3),
          ].filter(p => p.id)

          if (selected.length === 11) {
            // 3. Guardar en matchday 0 (equipo base permanente)
            const teamPlayers = selected.map((playerId, index) => ({
              team_id: teamData.id,
              player_id: playerId.id,
              is_starter: true,
              is_captain: index === 0,
              order: index,
              matchday: 0,
            }))

            const { error: insertError } = await supabase.from('team_players').insert(teamPlayers)
            if (insertError) {
              console.error('Error asignando jugadores:', insertError)
            } else {
              console.log('Equipo inicial de 11 jugadores asignado correctamente')
            }
          } else {
            console.warn(`Solo se seleccionaron ${selected.length} jugadores`)
          }
        }
      }
    }

    setLoading(false)
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo y título */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="relative w-32 h-32">
              <Image
                src="/icono_lliga.png"
                alt="Liga Marca Vilafranca"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white">
            Lliga Marca<span className="text-emerald-500"> Vilafranca</span>
          </h1>
          <p className="text-slate-400 mt-2">Crea tu cuenta para competir</p>
        </div>

        {/* Tarjeta de registro */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 text-center">Registro</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="nombre" className="block text-sm font-medium text-slate-700 mb-1">
                Nombre Completo
              </label>
              <input
                type="text"
                id="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                placeholder="Tu nombre"
                required
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                placeholder="tu@email.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                placeholder="••••••••"
                minLength={6}
                required
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creando cuenta...' : 'Registrarse'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-600">
              ¿Ya tienes cuenta?{' '}
              <button
                onClick={() => router.push('/')}
                className="text-emerald-600 font-semibold hover:text-emerald-700 hover:underline"
              >
                Inicia sesión
              </button>
            </p>
          </div>
        </div>

        <footer className="text-center mt-8 text-slate-500 text-sm">
          <p>&copy; 2026 LFM Vilafranca</p>
        </footer>
      </div>
    </div>
  )
}
