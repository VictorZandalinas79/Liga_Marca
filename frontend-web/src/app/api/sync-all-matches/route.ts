import { NextRequest, NextResponse } from 'next/server'
import { dispatchLiveSync } from '@/lib/github-dispatch'

// Sincroniza una jornada entera: dispara el workflow de GitHub Actions con la
// lista de fixtures pendientes. El procesado (motor de puntuación + subida a
// Supabase) ocurre en segundo plano en Actions, no en Vercel.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { matchday, fixtures } = body

    if (!matchday || !fixtures || !Array.isArray(fixtures)) {
      return NextResponse.json(
        { error: 'matchday y fixtures son requeridos' },
        { status: 400 }
      )
    }

    const ids = fixtures
      .map((f: { id?: string }) => f?.id)
      .filter(Boolean)
      .map(String)

    if (ids.length === 0) {
      return NextResponse.json({ error: 'No hay fixtures válidos' }, { status: 400 })
    }

    await dispatchLiveSync({ fixture_ids: ids.join(',') })

    return NextResponse.json({
      success: true,
      queued: true,
      message: `Sincronización de la jornada ${matchday} lanzada en segundo plano`,
      count: ids.length,
    })
  } catch (error: any) {
    console.error('Error lanzando sincronización de jornada:', error)
    return NextResponse.json(
      { error: 'No se pudo lanzar la sincronización', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
