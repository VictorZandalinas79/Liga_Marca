import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    const supabase = createClient(cookies())

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('sync_notifications')
      .select('*')
      .eq('type', 'unmatched')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ players: data || [] })
  } catch (error: any) {
    console.error('Error fetching unmatched players:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
