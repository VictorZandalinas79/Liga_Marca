import { NextRequest, NextResponse } from 'next/server'
import { dispatchLiveSync } from '@/lib/github-dispatch'

// Sincroniza UN partido: dispara el workflow de GitHub Actions, que ejecuta
// el motor de puntuación (trigger_descarga_eventos.py) y sube los datos a
// Supabase. La sincronización ocurre en segundo plano (no bloquea la respuesta).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fixture_id } = body

    if (!fixture_id) {
      return NextResponse.json({ error: 'fixture_id es requerido' }, { status: 400 })
    }

    await dispatchLiveSync({ fixture_ids: String(fixture_id) })

    return NextResponse.json({
      success: true,
      queued: true,
      message: 'Sincronización lanzada en segundo plano (GitHub Actions)',
    })
  } catch (error: any) {
    console.error('Error lanzando sincronización:', error)
    return NextResponse.json(
      { error: 'No se pudo lanzar la sincronización', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
