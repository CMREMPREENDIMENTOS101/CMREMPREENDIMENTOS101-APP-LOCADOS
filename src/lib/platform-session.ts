import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export interface PlatformSession {
  id: string
  name: string
  email: string
  role: 'admin' | 'user'
  allowedPages: string[] | null // null = acesso total
}

/**
 * Sessão da plataforma = login do Supabase Auth (JWT validado no servidor do
 * Supabase) + linha ativa em app_users, que define perfil e páginas liberadas.
 * Retorna null se não há login válido ou se o e-mail não está liberado.
 */
export async function loadPlatformSession(supabase: SupabaseClient): Promise<PlatformSession | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null

  const { data } = await supabase
    .from('app_users')
    .select('id,name,email,role,active,allowed_pages')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()

  if (!data || !data.active) return null

  // allowed_pages pode não existir em bancos antigos — trata como acesso total
  const allowedPages: string[] | null = Array.isArray(data.allowed_pages) ? data.allowed_pages : null
  return {
    id: data.id, name: data.name, email: data.email, role: data.role,
    allowedPages: data.role === 'admin' ? null : allowedPages,
  }
}

/**
 * Guarda para rotas /api (o middleware não cobre /api). Devolve a resposta de
 * erro quando não há acesso, ou null quando pode seguir.
 * `page` = chave da página em ACCESS_PAGES que a rota atende (ex.: 'documents').
 */
export async function requirePlatformUser(page?: string): Promise<NextResponse | null> {
  const session = await loadPlatformSession(createClient())
  if (!session) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  if (page && session.role !== 'admin' && Array.isArray(session.allowedPages) && !session.allowedPages.includes(page)) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 })
  }
  return null
}
