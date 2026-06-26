// Persistência local mínima. O sistema não tem banco de dados nem cadastro:
// o único dado salvo é o conjunto de parâmetros fiscais (Configurações).
import { PARAMETROS_PADRAO, type ParametrosFiscais } from "./config"

const K_PARAMS = "gn:parametros"

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
