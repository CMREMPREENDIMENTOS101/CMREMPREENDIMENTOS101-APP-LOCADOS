# Locados CMR

App de celular (PWA) para controlar os equipamentos locados nas obras da CMR Empreendimentos.
Projeto próprio: repositório e projeto Vercel separados da Plataforma CMR (`APP-CMR-GERAL`).

## O que é

| Arquivo | Função |
|---|---|
| `public/locados.html` | O app inteiro (HTML + JS único, sem build). Os dados das locações ficam no `localStorage` do aparelho |
| `public/locados.webmanifest`, `public/locados-sw.js` | Instalável + offline (service worker com escopo `/locados`) |
| `public/locados-icon-*.png` | Ícones |
| `src/app/api/auth/login`, `logout` | Login e saída pelo Supabase Auth (cookies de sessão) |
| `src/app/api/locados/obras` | Lista de obras (`projects`) para o seletor de obra. Exige a permissão `locados` |
| `src/app/api/locados/usuarios` | Usuários do app: criar, nova senha, ativar/desativar, excluir, trocar a própria senha |
| `src/lib/platform-session.ts` | Sessão = login do Supabase + linha ativa em `app_users` com a permissão |

## Dependência da Plataforma (de propósito)

Compartilha o **mesmo projeto Supabase** da Plataforma CMR: o login, a tabela `app_users`
(permissão `locados` em `allowed_pages`) e a tabela `projects` (obras). Quem libera o acesso
de um usuário ao Locados é o cadastro de usuários da Plataforma (Configurações → Usuários)
ou a engrenagem do próprio app. O deploy é independente.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Nome | Para quê |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase (a mesma da Plataforma) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública (anon) do mesmo projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | Só para criar/trocar senha de usuários pela engrenagem. **Segredo**: sem ela o app funciona, mas "Novo usuário" e "Nova senha" ficam desativados |

## Publicar

Publique sempre a partir do GitHub (conectar o repositório em Vercel → Settings → Git).
Não use `vercel deploy` de uma pasta local com commits não enviados.
