import type { Metadata } from "next"
import "./globals.css"
import { Nav } from "@/components/Nav"
import { Toaster } from "@/components/Toaster"

export const metadata: Metadata = {
  title: "Gilberto Negreiros — Relatório Fiscal",
  description: "Geração de relatórios fiscais mensais para clientes — Simples Nacional e Lucro Presumido.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <div className="min-h-screen flex">
          <Nav />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
        <Toaster />
      </body>
    </html>
  )
}
