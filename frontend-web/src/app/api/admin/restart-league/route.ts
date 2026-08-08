import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-admin'
import { createAdminSupabase } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const admin = createAdminSupabase()

    // Delete all penalties
    const { error: penaltiesError } = await admin.from('penalties').delete().neq('id', '00000000-0000-0000-0000-000000000000') // delete all hack for supabase
    if (penaltiesError) {
      throw new Error(`Error deleting penalties: ${penaltiesError.message}`)
    }

    // Delete all player_scores
    // Since player_scores has team_id to track points for teams, and we want to wipe points of users' teams,
    // we delete all rows from player_scores. 
    // Wait, Supabase requires a filter for delete(), so we use .neq('id', '00000000-0000-0000-0000-000000000000')
    const { error: scoresError } = await admin.from('player_scores').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (scoresError) {
      throw new Error(`Error deleting player_scores: ${scoresError.message}`)
    }

    // Reset financial accumulations for all users
    const { error: profilesError } = await admin.from('profiles').update({
      amount_paid: 0,
      infraction_penalties: 0
    }).neq('id', '00000000-0000-0000-0000-000000000000')
    if (profilesError) {
      throw new Error(`Error resetting profiles: ${profilesError.message}`)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[RESTART_LEAGUE]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
