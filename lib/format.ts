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

/** Enxuga a descrição da atividade do PGDAS-D (que é longa e cheia de jargão) num
 *  rótulo curto e claro para o dono da empresa. A segregação (ST/monofásico) já é
 *  sinalizada por selos no relatório, então o rótulo fica só com a atividade-base;
 *  para serviços mantém a distinção de ISS (que diferencia linhas). Idempotente:
 *  rótulos manuais/curtos passam intactos (só corta o excesso e o texto entre "-"). */
export const atividadeCurta = (desc: unknown): string => {
  const d = String(desc || "").replace(/\s+/g, " ").trim()
  if (!d) return d
  const low = d.toLowerCase()
  const tail = d.split(/\s[-–]\s/).slice(1).join(" ").toLowerCase()
  let base: string
  if (/revenda de mercadorias/.test(low)) base = "Revenda de mercadorias"
  else if (/venda de mercadorias industrializ/.test(low)) base = "Venda de industrializados"
  else if (/loca[çc][ãa]o de bens m[óo]veis/.test(low)) base = "Locação de bens móveis"
  else if (/presta[çc][ãa]o de servi[çc]os?/.test(low)) base = "Prestação de serviços"
  else if (/transporte\b/.test(low)) base = "Transporte"
  else {
    // não reconhecida (ou já curta / digitada à mão): usa só o trecho antes do " - "
    const cut = d.split(/\s[-–]\s/)[0].trim()
    return cut.length > 44 ? cut.slice(0, 42).replace(/[,;]\s*$/, "").trim() + "…" : cut
  }
  let suf = ""
  if (base === "Prestação de serviços") {
    if (/iss devido a outro munic[íi]pio/.test(tail)) suf = " (ISS a outro município)"
    // só "COM retenção/substituição de ISS" é retido; "sem retenção..." é normal.
    else if (/^com\b/.test(tail) && /(reten[çc][ãa]o|substitui[çc][ãa]o)[^.]*iss/.test(tail)) suf = " (ISS retido)"
  }
  return base + suf
}

export const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
export const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
