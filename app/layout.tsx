import type { Metadata } from "next"
import { Jost, IBM_Plex_Sans } from "next/font/google"
import "./globals.css"
import { Nav } from "@/components/Nav"
import { Toaster } from "@/components/Toaster"

// Fontes auto-hospedadas pelo Next (baixadas no build; servidas do próprio site).
// Sem @import externo → a fonte é sempre a mesma, inclusive no PDF (html2canvas).
// Expostas como variáveis CSS (--font-jost / --font-plex) usadas na UI e no relatório.
const jost = Jost({ subsets: ["latin"], variable: "--font-jost", display: "swap" })
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-plex", display: "swap" })

export const metadata: Metadata = {
  title: "Gilberto Negreiros — Relatório Fiscal",
  description: "Geração de relatórios fiscais mensais para clientes — Simples Nacional e Lucro Presumido.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${jost.variable} ${plex.variable}`} suppressHydrationWarning>
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
