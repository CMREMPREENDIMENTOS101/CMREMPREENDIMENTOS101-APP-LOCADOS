import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { loadPlatformSession } from '@/lib/platform-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Usuários do app Locados (engrenagem ⚙ do public/locados.html).
// GET lista; POST com `acao`:
//   criar       (admin) — cria o login no Supabase Auth com senha provisória e
//                         libera "locados" em app_users; devolve a senha UMA vez
//                         para o app montar a mensagem de WhatsApp.
//   senha       (admin) — define a senha do e-mail: a digitada em `senha` ou uma
//                         provisória gerada (e cria o login se a pessoa só
//                         existia em app_users).
//   ativo       (admin) — ativa/desativa (app_users.active).
//   excluir     (admin) — tira do app. Quem também usa a Plataforma só perde
//                         "locados"; quem era só do app sai de app_users e, se o
//                         login foi criado por este app (metadata origem
//                         'locados'), o login também é apagado — logins do
//                         Diário de Obras (mesmo Supabase Auth) ficam intactos.
//   minha-senha (todos) — troca a própria senha.
// Criar login e trocar senha de outra pessoa exigem SUPABASE_SERVICE_ROLE_KEY
// (só no servidor, nunca vai para o navegador).

const CARACTERES = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
const senhaProvisoria = () => Array.from({ length: 10 }, () => CARACTERES[randomInt(CARACTERES.length)]).join('')

function adminAuth() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!chave) return null
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin
}
const semChave = () => NextResponse.json({
  error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY na Vercel para criar logins e trocar senhas.',
}, { status: 503 })

// Supabase não busca usuário por e-mail: percorre as páginas.
async function idPorEmail(admin: NonNullable<ReturnType<typeof adminAuth>>, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const u = data.users.find(x => (x.email ?? '').toLowerCase() === email)
    if (u) return u.id
    if (data.users.length < 200) return null
  }
  return null
}

export async function GET() {
  const supabase = createClient()
  const sessao = await loadPlatformSession(supabase)
  if (!sessao) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const eu = { nome: sessao.name, email: sessao.email, admin: sessao.role === 'admin' }
  if (!eu.admin) return NextResponse.json({ eu, usuarios: [] })

  const { data, error } = await supabase.from('app_users').select('id,name,email,role,active,allowed_pages').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const usuarios = (data ?? [])
    .filter(u => u.role === 'admin' || (Array.isArray(u.allowed_pages) && u.allowed_pages.includes('locados')))
    .map(u => ({ id: u.id, nome: u.name, email: u.email, admin: u.role === 'admin', ativo: u.active }))
  return NextResponse.json({ eu, usuarios, podeCriar: !!process.env.SUPABASE_SERVICE_ROLE_KEY })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const sessao = await loadPlatformSession(supabase)
  if (!sessao) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const corpo = await req.json().catch(() => ({}))
  const acao = String(corpo.acao ?? '')

  if (acao === 'minha-senha') {
    const nova = String(corpo.senha ?? '')
    if (nova.length < 6) return NextResponse.json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, { status: 400 })
    const { error } = await supabase.auth.updateUser({ password: nova })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (sessao.role !== 'admin') return NextResponse.json({ error: 'Só administradores gerenciam usuários.' }, { status: 403 })

  if (acao === 'ativo') {
    if (corpo.id === sessao.id) return NextResponse.json({ error: 'Você não pode desativar a si mesmo.' }, { status: 400 })
    const { error } = await supabase.from('app_users').update({ active: !!corpo.ativo }).eq('id', String(corpo.id))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (acao === 'excluir') {
    const { data: u, error: erroBusca } = await supabase.from('app_users')
      .select('id,email,role,allowed_pages').eq('id', String(corpo.id)).maybeSingle()
    if (erroBusca) return NextResponse.json({ error: erroBusca.message }, { status: 500 })
    if (!u) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
    if (u.id === sessao.id) return NextResponse.json({ error: 'Você não pode excluir a si mesmo.' }, { status: 400 })
    if (u.role === 'admin') return NextResponse.json({ error: 'Administradores não são excluídos por aqui (use a Plataforma).' }, { status: 400 })

    const outras = (Array.isArray(u.allowed_pages) ? u.allowed_pages : []).filter((p: string) => p !== 'locados')
    if (outras.length) {
      const { error } = await supabase.from('app_users').update({ allowed_pages: outras }).eq('id', u.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, removido: 'acesso' })
    }
    const { error } = await supabase.from('app_users').delete().eq('id', u.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const adm = adminAuth()
    if (adm) {
      const id = await idPorEmail(adm, String(u.email).toLowerCase()).catch(() => null)
      if (id) {
        const { data } = await adm.getUserById(id)
        if (data?.user?.user_metadata?.origem === 'locados') await adm.deleteUser(id)
      }
    }
    return NextResponse.json({ ok: true, removido: 'usuario' })
  }

  const admin = adminAuth()
  if (!admin) return semChave()
  const email = String(corpo.email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })

  if (acao === 'senha') {
    // Senha digitada pelo admin (mín. 6) ou, em branco, uma provisória gerada aqui.
    const escolhida = String(corpo.senha ?? '')
    if (escolhida && escolhida.length < 6) return NextResponse.json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, { status: 400 })
    const senha = escolhida || senhaProvisoria()
    const id = await idPorEmail(admin, email)
    if (!id) {
      // Cadastrado na Plataforma sem o passo manual no Supabase: cria o login agora.
      const { data: cad } = await supabase.from('app_users').select('name').eq('email', email).maybeSingle()
      if (!cad) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
      const { error } = await admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { name: cad.name, origem: 'locados' } })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, senha, loginCriado: true })
    }
    const { error } = await admin.updateUserById(id, { password: senha })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, senha })
  }

  if (acao === 'criar') {
    const nome = String(corpo.nome ?? '').trim()
    if (!nome) return NextResponse.json({ error: 'Informe o nome.' }, { status: 400 })

    // 1) cadastro/permissão em app_users — quem já é da Plataforma só ganha "locados"
    const { data: existente } = await supabase.from('app_users').select('id,allowed_pages,role').eq('email', email).maybeSingle()
    if (existente) {
      const paginas = Array.isArray(existente.allowed_pages) ? existente.allowed_pages : []
      const { error } = await supabase.from('app_users')
        .update({ active: true, allowed_pages: paginas.includes('locados') ? paginas : [...paginas, 'locados'] }).eq('id', existente.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await supabase.from('app_users')
        .insert({ name: nome, email, role: 'user', active: true, allowed_pages: ['locados'] })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 2) login no Supabase Auth — se já existe (ex.: usa o Diário de Obras), mantém a senha dele
    const senha = senhaProvisoria()
    const { error } = await admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { name: nome, origem: 'locados' } })
    if (error) {
      if (/already|registered|exists/i.test(error.message)) return NextResponse.json({ ok: true, senha: null, jaTinhaLogin: true })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, senha })
  }

  return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 })
}
