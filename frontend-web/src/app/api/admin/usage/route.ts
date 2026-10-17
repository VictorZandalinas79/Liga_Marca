import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-admin'
import { createAdminSupabase } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Informe de consumo del plan Free (ver migraciones 037_admin_usage_report.sql
// y 040_admin_query_stats.sql). Solo lee catálogos de Postgres: abrir el panel
// no gasta cuota apreciable.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminSupabase()
  const [reportRes, statsRes] = await Promise.all([
    admin.rpc('admin_usage_report'),
    admin.rpc('admin_query_stats'),
  ])
  if (reportRes.error) return NextResponse.json({ error: reportRes.error.message }, { status: 500 })
  // Sin la migración 040 el resto del panel sigue funcionando.
  return NextResponse.json({
    report: reportRes.data,
    queryStats: statsRes.error ? null : statsRes.data,
  })
}

// Pone a cero el contador de consultas (pg_stat_statements) para medir desde ahora.
export async function POST() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminSupabase()
  const { data, error } = await admin.rpc('admin_reset_query_stats')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ resetAt: data })
}
