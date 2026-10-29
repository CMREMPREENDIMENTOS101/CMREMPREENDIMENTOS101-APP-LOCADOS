import { NextResponse } from 'next/server'
import { requirePlatformUser } from '@/lib/platform-session'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Lista de obras para o app de equipamentos locados (public/locados.html).
// Só id, nome, local e situação — o app usa para o seletor de obra.
// Exige a permissão "App Locados" (admin sempre passa); o app trava sem ela.
export async function GET() {
  const denied = await requirePlatformUser('locados')
  if (denied) return denied
  const { data, error } = await createClient()
    .from('projects')
    .select('id,name,location,status')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ obras: data ?? [] })
}
