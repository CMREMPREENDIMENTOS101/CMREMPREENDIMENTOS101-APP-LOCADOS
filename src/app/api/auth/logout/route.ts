import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  await createClient().auth.signOut()
  const res = NextResponse.json({ ok: true })
  res.cookies.set('cmr_session', '', { maxAge: 0, path: '/' }) // cookie legado
  return res
}
