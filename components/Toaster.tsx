"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, XCircle, Info, AlertTriangle } from "lucide-react"
import type { ToastMsg } from "@/lib/toast"

const ICON = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle }
const COLOR = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
}

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([])
  useEffect(() => {
    const handler = (e: Event) => {
      const t = (e as CustomEvent<ToastMsg>).detail
      setItems((p) => [...p, t])
      setTimeout(() => setItems((p) => p.filter((x) => x.id !== t.id)), 5000)
    }
    window.addEventListener("gn-toast", handler)
    return () => window.removeEventListener("gn-toast", handler)
  }, [])
  return (
    <div className="no-print fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]">
      {items.map((t) => {
        const Icon = ICON[t.kind]
        return (
          <div key={t.id} className={"flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm shadow-sm " + COLOR[t.kind]}>
            <Icon className="h-4 w-4 mt-0.5 shrink-0" />
            <span className="leading-snug">{t.msg}</span>
          </div>
        )
      })}
    </div>
  )
}
