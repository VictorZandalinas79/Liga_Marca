import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-admin'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDivisionLockState } from '@/lib/divisions'

export const dynamic = 'force-dynamic'

// Actualiza datos y/o estado de pago de un usuario (parcial: solo lo enviado).
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await context.params
  const body = await request.json().catch(() => ({}))
  const admin = createAdminSupabase()

  // 1. Datos en auth.users (email y nombre completo en metadata)
  const authUpdate: { email?: string; email_confirm?: boolean; user_metadata?: Record<string, unknown> } = {}
  
  // 2. Datos en profiles (teléfono + pago + nombre completo)
  const update: Record<string, unknown> = { id }
  let touchProfile = false
  if ('email' in body && body.email) {
    authUpdate.email = String(body.email).trim().toLowerCase()
    authUpdate.email_confirm = true // confirmar directamente, sin email de verificación
  }
  if ('full_name' in body) {
    const { data: cur } = await admin.auth.admin.getUserById(id)
    authUpdate.user_metadata = {
      ...(cur?.user?.user_metadata ?? {}),
      full_name: String(body.full_name ?? ''),
    }
    update.full_name = String(body.full_name ?? '')
    touchProfile = true
  }
  if (Object.keys(authUpdate).length > 0) {
    const { error } = await admin.auth.admin.updateUserById(id, authUpdate)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }



  if ('phone' in body) {
    update.phone = body.phone ? String(body.phone) : null
    touchProfile = true
  }
  if ('has_paid' in body) {
    const hasPaid = Boolean(body.has_paid)
    update.has_paid = hasPaid
    if (hasPaid && !('paid_at' in body)) update.paid_at = new Date().toISOString()
    if (!hasPaid) update.paid_at = null
    touchProfile = true
  }
  if ('paid_at' in body) {
    update.paid_at = body.paid_at ? body.paid_at : null
    touchProfile = true
  }
  if ('amount_paid' in body) {
    const n = Number(body.amount_paid)
    update.amount_paid = Number.isFinite(n) ? n : 0
    touchProfile = true
  }
  if ('entry_fee_paid' in body) {
    const n = Number(body.entry_fee_paid)
    update.entry_fee_paid = Number.isFinite(n) && n >= 0 ? n : 0
    touchProfile = true
  }
  if ('division' in body) {
    // Las divisiones se congelan al cerrar el mercado de la primera jornada del
    // juego. Cambiarlas después reescribiría sanciones ya cobradas —las del
    // usuario y las de sus rivales, porque la exclusividad depende de con quién
    // comparte tabla.
    // EXCEPCIÓN: Se permite asignar división a NUEVOS usuarios (que actualmente
    // tienen division = null) para que puedan empezar a jugar en el próximo tramo abierto.
    const lock = await getDivisionLockState(admin)
    const raw = body.division
    
    if (lock.locked) {
      // Obtenemos la división actual del usuario para comprobar si es nuevo
      const { data: currentProfile } = await admin.from('profiles').select('division').eq('id', id).single()
      const isNewUser = currentProfile?.division === null
      
      // Si el candado está activo y no es un usuario nuevo (o estamos intentando quitarle la división)
      if (!isNewUser || (raw === null || raw === '' || raw === undefined)) {
        return NextResponse.json(
          {
            error: `Las divisiones quedaron cerradas al empezar la jornada ${lock.startingMatchday}. Solo se permite asignar división a usuarios nuevos que no tenían ninguna.`,
          },
          { status: 409 }
        )
      }
    }

    // null / '' => sin asignar; solo se aceptan las divisiones 1, 2 y 3.
    if (raw === null || raw === '' || raw === undefined) {
      update.division = null
    } else {
      const d = Number(raw)
      update.division = [1, 2, 3].includes(d) ? d : null
    }
    touchProfile = true
  }
  if ('collected_by' in body) {
    update.collected_by = body.collected_by ? String(body.collected_by).trim() : null
    touchProfile = true
  }

  if (touchProfile) {
    const { error } = await admin.from('profiles').update(update).eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}

// Elimina un usuario. Requiere la contraseña del administrador para confirmar.
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await context.params
  const body = await request.json().catch(() => ({}))
  const password = String(body.password ?? '')

  if (!password) {
    return NextResponse.json({ error: 'Falta la contraseña de administrador' }, { status: 400 })
  }
  if (id === auth.userId) {
    return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta' }, { status: 400 })
  }

  const admin = createAdminSupabase()

  // No permitir eliminar otras cuentas de administrador
  const { data: target } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', id)
    .maybeSingle()
  if (target?.is_admin) {
    return NextResponse.json({ error: 'No se puede eliminar una cuenta de administrador' }, { status: 400 })
  }

  // Verificar la contraseña del administrador re-autenticando
  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { error: signErr } = await verifier.auth.signInWithPassword({
    email: auth.email,
    password,
  })
  if (signErr) {
    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 })
  }

  // Limpiar dependencias (equipos y alineaciones) y luego el usuario de auth
  const { data: teams } = await admin.from('user_teams').select('id').eq('user_id', id)
  const teamIds = (teams ?? []).map((t) => t.id)
  if (teamIds.length > 0) {
    await admin.from('team_players').delete().in('team_id', teamIds)
    await admin.from('user_teams').delete().eq('user_id', id)
  }
  // Borrar el perfil explícitamente (por si la FK no tiene ON DELETE CASCADE)
  await admin.from('profiles').delete().eq('id', id)

  const { error: delErr } = await admin.auth.admin.deleteUser(id)
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
