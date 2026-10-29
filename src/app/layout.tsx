// O app em si é public/locados.html (HTML + JS único, sem build); o Next só serve as rotas /api/*.
export const metadata = { title: 'Locados CMR' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
