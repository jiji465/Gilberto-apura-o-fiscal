// Toast minimalista via CustomEvent (sem dependência externa).
export type ToastKind = "success" | "error" | "info" | "warning"
export interface ToastMsg { id: number; kind: ToastKind; msg: string }

let seq = 0
export function toast(kind: ToastKind, msg: string) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("gn-toast", { detail: { id: ++seq, kind, msg } as ToastMsg }))
}
export const toastSuccess = (m: string) => toast("success", m)
export const toastError = (m: string) => toast("error", m)
export const toastInfo = (m: string) => toast("info", m)
export const toastWarning = (m: string) => toast("warning", m)
