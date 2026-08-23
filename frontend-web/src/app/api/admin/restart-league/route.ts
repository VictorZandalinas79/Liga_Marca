import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-admin'
import { createAdminSupabase } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Reinicia la liga a partir de una jornada concreta.
 *
 * IMPORTANTE: NO se borra `player_scores`. Los jugadores siguen puntuando desde
 * la J1 (esos datos vienen de Opta/Biwenger y se necesitan para el histórico y
 * para las medias). Lo que se pone a cero son los datos DE LOS USUARIOS:
 *  - `fantasy_starting_matchday` pasa a la jornada indicada, así que todo lo que
 *    se calcula en `lib/standings.ts` (puntos, rankings, podios, colistas,
 *    pagos por jornada, saldo, accesos a la app) solo mira de ahí en adelante.
 *  - Se borran las sanciones (`penalties`) y los pagos por jornada ya aplicados
 *    (`matchday_payments`).
 *  - Se ponen a 0 los acumulados de `profiles` (`amount_paid`,
 *    `infraction_penalties`).
 *
 * Se mantienen intactos: `player_scores` (puntos de los jugadores), plantillas
 * (`team_players`), divisiones, la configuración del resto de reglas y TODA la
 * columna de cobros de la tabla de Admin: `entry_fee_paid` (Cuota), `has_paid`
 * (Pagado/Pendiente), `paid_at` y `collected_by`.
 *
 * Además de ser admin hay que reintroducir la contraseña de la propia cuenta:
 * la acción es irreversible, así que no basta con tener la sesión abierta.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json().catch(() => ({}))
    const startingMatchday = Number(body?.startingMatchday)
    if (!Number.isInteger(startingMatchday) || startingMatchday < 1 || startingMatchday > 38) {
      return NextResponse.json(
        { error: 'Indica una jornada de inicio válida (1-38)' },
        { status: 400 }
      )
    }

    const password = typeof body?.password === 'string' ? body.password : ''
    if (!password) {
      return NextResponse.json({ error: 'Escribe tu contraseña para confirmar' }, { status: 400 })
    }

    // Reautenticación: se comprueba la contraseña del admin con la clave anon y
    // sin persistir sesión, para no tocar las cookies de la sesión actual.
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const { error: passwordError } = await anon.auth.signInWithPassword({
      email: auth.email,
      password,
    })
    if (passwordError) {
      const limited = passwordError.status === 429
      return NextResponse.json(
        {
          error: limited
            ? 'Demasiados intentos. Espera un momento y vuelve a probar.'
            : 'Contraseña incorrecta',
        },
        { status: limited ? 429 : 401 }
      )
    }

    const admin = createAdminSupabase()
    const ALL = '00000000-0000-0000-0000-000000000000' // Supabase exige filtro en delete()

    // 1. Sanciones a 0
    const { error: penaltiesError } = await admin.from('penalties').delete().neq('id', ALL)
    if (penaltiesError) {
      throw new Error(`Error borrando sanciones: ${penaltiesError.message}`)
    }

    // 2. Pagos por jornada ya aplicados a 0
    const { error: paymentsError } = await admin.from('matchday_payments').delete().neq('id', ALL)
    if (paymentsError) {
      throw new Error(`Error borrando pagos por jornada: ${paymentsError.message}`)
    }

    // 3. Acumulados de juego de cada usuario a 0 (el saldo vuelve al inicial).
    //    Solo estas dos columnas: la cuota (`entry_fee_paid`) y el estado de
    //    cobro (`has_paid`, `paid_at`, `collected_by`) NO se tocan.
    const { error: profilesError } = await admin
      .from('profiles')
      .update({ amount_paid: 0, infraction_penalties: 0 })
      .neq('id', ALL)
    if (profilesError) {
      throw new Error(`Error reseteando finanzas de usuarios: ${profilesError.message}`)
    }

    // 4. La liga arranca en la jornada indicada
    const { error: configError } = await admin
      .from('league_config')
      .update({ fantasy_starting_matchday: startingMatchday, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (configError) {
      throw new Error(`Error actualizando la jornada de inicio: ${configError.message}`)
    }

    return NextResponse.json({ success: true, startingMatchday })
  } catch (err: any) {
    console.error('[RESTART_LEAGUE]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
