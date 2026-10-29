import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadPlatformSession } from '@/lib/platform-session'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'E-mail e senha são obrigatórios.' }, { status: 400 })
  }

  // Login pelo Supabase Auth: a senha é conferida (hash) pelo Supabase e o
  // token de sessão volta em cookies assinados — nada de senha em tabela.
  const supabase = createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: String(email).toLowerCase().trim(),
    password: String(password),
  })

  if (error) {
    if (error.status === 429) {
      return NextResponse.json({ error: 'Muitas tentativas. Aguarde um instante e tente de novo.' }, { status: 429 })
    }
    return NextResponse.json({ error: 'E-mail ou senha incorretos.' }, { status: 401 })
  }

  // Ter login no Supabase não basta: o e-mail precisa estar liberado (e ativo) em app_users.
  const session = await loadPlatformSession(supabase)
  if (!session) {
    await supabase.auth.signOut()
    return NextResponse.json({ error: 'Sem acesso à plataforma (usuário não cadastrado ou inativo). Contate o administrador.' }, { status: 403 })
  }

  const res = NextResponse.json({ ok: true, user: session })
  res.cookies.set('cmr_session', '', { maxAge: 0, path: '/' }) // cookie legado, sem assinatura
  return res
}
