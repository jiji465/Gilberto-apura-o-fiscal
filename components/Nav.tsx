"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, FileBarChart2, Settings } from "lucide-react"

const ITEMS = [
  { href: "/", label: "Painel", icon: LayoutDashboard },
  { href: "/relatorio", label: "Relatório Mensal", icon: FileBarChart2 },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
]

export function Nav() {
  const path = usePathname()
  return (
    <aside className="no-print w-56 shrink-0 border-r border-[var(--line)] bg-white min-h-screen flex flex-col">
      <div className="px-5 py-5 border-b border-[var(--line)]">
        <div className="font-serif font-bold text-lg text-[var(--navy)] leading-none tracking-wide">GILBERTO NEGREIROS</div>
        <div className="text-[10px] font-semibold tracking-[0.25em] text-[var(--gold)] uppercase mt-1">Contabilidade</div>
      </div>
      <nav className="p-3 flex flex-col gap-1">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
                (active ? "bg-[var(--navy)] text-white" : "text-[var(--ink)] hover:bg-[#f3f1ec]")
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto px-5 py-4 text-[10px] text-[var(--muted)] border-t border-[var(--line)]">
        Relatório Fiscal Mensal · v1
      </div>
    </aside>
  )
}
