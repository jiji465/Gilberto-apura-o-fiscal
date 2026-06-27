// Persistência local mínima. O sistema não tem banco de dados nem cadastro de
// clientes/competências. Persistimos apenas: (1) os parâmetros fiscais
// (Configurações) e (2) o RASCUNHO da competência em edição — para o trabalho
// não se perder ao navegar entre as páginas. O rascunho é único (não é histórico).
import { PARAMETROS_PADRAO, type ParametrosFiscais } from "./config"
import type { ClientData } from "./types"

const K_PARAMS = "gn:parametros"
const K_DRAFT = "gn:draft"

export function uid(): string {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/* ===== Parâmetros fiscais (Configurações) ===== */
export function getParametros(): ParametrosFiscais {
  if (typeof window === "undefined") return PARAMETROS_PADRAO
  try {
    return { ...PARAMETROS_PADRAO, ...JSON.parse(window.localStorage.getItem(K_PARAMS) || "{}") }
  } catch {
    return PARAMETROS_PADRAO
  }
}
export function saveParametros(p: ParametrosFiscais) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(K_PARAMS, JSON.stringify(p))
  } catch {
    /* quota / indisponível */
  }
}

/* ===== Rascunho da competência em edição (não é histórico; é único) ===== */
export function getDraft(): ClientData | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(K_DRAFT)
    return raw ? (JSON.parse(raw) as ClientData) : null
  } catch {
    return null
  }
}
export function saveDraft(cd: ClientData) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(K_DRAFT, JSON.stringify(cd))
  } catch {
    /* quota / indisponível */
  }
}
export function clearDraft() {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(K_DRAFT)
  } catch {
    /* indisponível */
  }
}
