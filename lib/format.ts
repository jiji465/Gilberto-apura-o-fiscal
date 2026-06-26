// Helpers de formatação pt-BR. Valores monetários trafegam como string "1.234,56".

export const parseBR = (v: unknown): number => {
  if (typeof v === "number") return v
  if (!v) return 0
  return parseFloat(String(v).replace(/\./g, "").replace(",", ".")) || 0
}

export const fmtBRL = (val: unknown): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseBR(val) || 0)

export const fmtNum = (num: unknown): string => {
  if (num === "" || num === null || num === undefined) return ""
  return parseBR(num).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const fmtPct = (val: unknown): string => (parseBR(val) || 0).toFixed(2).replace(".", ",") + "%"

/** Inteiro abreviado: 171300 → "171,3k". */
export const fmtKm = (v: number): string =>
  Math.abs(v) >= 1000
    ? (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "k"
    : Math.round(v).toLocaleString("pt-BR")

/** Inteiro com separador de milhar. */
export const fmtK = (v: number): string => Math.round(v || 0).toLocaleString("pt-BR")

export const fmtCNPJ = (v: unknown): string => {
  const d = String(v || "").replace(/\D/g, "").slice(0, 14)
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
}

/** Máscara de digitação monetária (centavos da direita p/ esquerda). */
export const maskBRL = (raw: unknown): string => {
  if (raw === "" || raw === null || raw === undefined) return ""
  const digits = String(raw).replace(/\D/g, "")
  if (!digits) return ""
  return (parseInt(digits, 10) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
export const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
