// Leitor da Declaração/Extrato do PGDAS-D.
// Recebe o texto extraído do PDF e devolve os campos + a repartição exata dos tributos,
// com:
//   • Repartição "oficial" lida da seção "Total Geral da Empresa" (soma correta mesmo
//     com várias atividades).
//   • Segregação por atividade → ICMS normal × ICMS-ST e PIS/COFINS monofásico
//     (flags "Substituição tributária de:" / "Tributação monofásica de:").
//   • Fator r tratando "Não se aplica" e conferindo com folha12m / RBT12.
//   • warnings[] avisando divergências (soma ≠ DAS, Fator R divergente).
import { parseBR } from "./format"

export interface PgdasAtividade {
  descricao: string
  receita: string
  repart: Record<string, string>
  total: string
  substituicaoICMS: boolean
  monofasica: boolean
}

export interface PgdasSegregacao {
  icmsNormal: number
  icmsST: number
  issTotal: number
  pisCofinsMonofasico: number
  pisCofinsNormal: number
}

export interface PgdasResult {
  fields: {
    cnpj?: string
    clientName?: string
    compMonth?: string
    compYear?: string
    revenue?: string
    rbt12?: string
    folha12m?: string
    anexo?: string
    fatorRDecl?: string
    dasOfficial?: string
    atividade?: string
    rba?: string
    rbaa?: string
    vencimento?: string
    nDeclaracao?: string
    dataAbertura?: string
    municipio?: string
    uf?: string
  }
  repart: Record<string, string>
  atividades: PgdasAtividade[]
  seg: PgdasSegregacao
  warnings: string[]
}

const TRIB_ORDER = ["IRPJ", "CSLL", "COFINS", "PIS/PASEP", "CPP", "ICMS", "IPI", "ISS"] as const
const HEADER_RE = /IRPJ\s+CSLL\s+COFINS\s+PIS\/Pasep\s+INSS\/CPP\s+ICMS\s+IPI\s+ISS\s+Total/i

/** Lê os 9 números (8 tributos + total) logo após o primeiro cabeçalho de tributos no trecho. */
function readRepart(slice: string): { repart: Record<string, string>; total: string } | null {
  const idx = slice.search(HEADER_RE)
  if (idx < 0) return null
  const nums = slice.slice(idx).match(/\d[\d.]*,\d{2}/g)
  if (!nums || nums.length < 9) return null
  const [irpj, csll, cofins, pis, inss, icms, ipi, iss, total] = nums
  return {
    repart: { IRPJ: irpj, CSLL: csll, COFINS: cofins, "PIS/PASEP": pis, CPP: inss, ICMS: icms, IPI: ipi, ISS: iss },
    total,
  }
}

export function parsePGDAS(raw: string): PgdasResult | null {
  if (!raw || raw.trim().length < 20) return null
  const text = raw.replace(/ /g, " ")
  const f: PgdasResult["fields"] = {}
  const warnings: string[] = []
  const money = (re: RegExp): string | undefined => {
    const m = text.match(re)
    return m ? m[1] : undefined
  }

  const cnpj = text.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/)
  if (cnpj) f.cnpj = cnpj[1]

  let m = text.match(/Nome\s+[eE]mpresarial[:\s]*([^\n]+)/i)
  if (m) {
    // Corta o valor no primeiro rótulo de campo vizinho (CNPJ, Data de Abertura, etc.)
    // ou num vão de coluna real (3+ espaços). NÃO corta em 2 espaços: a extração do
    // PDF insere espaço duplo DENTRO da razão social, o que truncava o nome.
    f.clientName = m[1]
      .split(/\s{3,}|\s+CNPJ\b|\s+CPF\b|\s+Data\s+de\s+[aA]bertura|\s+Optante\b|\s+Regime\s+de\b|\s+Situa[çc][ãa]o|\s+Per[ií]odo\s+de/i)[0]
      .replace(/\s+/g, " ")
      .trim()
  }

  m = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s*a\s*\d{2}\/\d{2}\/\d{4}/)
  if (m) {
    f.compMonth = String(parseInt(m[2], 10))
    f.compYear = m[3]
  } else {
    m = text.match(/Per[ií]odo\s+de\s+Apura[çc][aã]o\s*\(PA\)[:\s]*(\d{2})\/(\d{4})/i)
    if (m) {
      f.compMonth = String(parseInt(m[1], 10))
      f.compYear = m[2]
    }
  }

  f.revenue = money(/RPA\)\s*-?\s*Compet[êe]ncia\s+([\d.]+,\d{2})/i) || money(/RPA\)[\s\S]{0,60}?([\d.]+,\d{2})/i)
  f.rbt12 = money(/\(RBT12\)\s*([\d.]+,\d{2})/i) || money(/doze\s+meses\s+anteriores[\s\S]{0,80}?([\d.]+,\d{2})/i)
  f.rba = money(/\(RBA\)\s*([\d.]+,\d{2})/i) || money(/ano-calend[áa]rio\s+corrente[\s\S]{0,60}?([\d.]+,\d{2})/i)
  f.rbaa = money(/\(RBAA\)\s*([\d.]+,\d{2})/i) || money(/ano-calend[áa]rio\s+anterior[\s\S]{0,60}?([\d.]+,\d{2})/i)
  f.folha12m = money(/Total\s+de\s+Folhas?[\s\S]{0,80}?([\d.]+,\d{2})/i)

  m = text.match(/Fator\s*r\s*=\s*([\d,]+)\s*-\s*Anexo\s+(IV|V|III|II|I)\b/i)
  if (m) {
    f.fatorRDecl = m[1]
    f.anexo = "Anexo " + m[2].toUpperCase()
  } else if (/Fator\s*r\s*=\s*N[ãa]o\s+se\s+aplica/i.test(text)) {
    // não se aplica — anexo inferido pelo tributo
  } else {
    m = text.match(/Fator\s*r[\s=]*([\d,]+)/i)
    if (m) f.fatorRDecl = m[1]
    m = text.match(/Anexo\s+(IV|V|III|II|I)\b/i)
    if (m) f.anexo = "Anexo " + m[1].toUpperCase()
  }

  m = text.match(/N[ºo°]\s*da\s+Declara[çc][ãa]o[:\s]*([\d.]+)/i)
  if (m) f.nDeclaracao = m[1]
  m = text.match(/Data\s+de\s+[aA]bertura(?:\s+no\s+CNPJ)?[:\s]*(\d{2}\/\d{2}\/\d{4})/i)
  if (m) f.dataAbertura = m[1]
  m = text.match(/Munic[íi]pio[:\s]*([A-ZÀ-Ú][^\n]*?)\s+UF[:\s]*([A-Z]{2})/i)
  if (m) {
    f.municipio = m[1].trim()
    f.uf = m[2]
  }
  m = text.match(/Data\s+de\s+Vencimento[:\s]*(\d{2}\/\d{2}\/\d{4})/i) || text.match(/acolhimento[:\s]*(\d{2}\/\d{2}\/\d{4})/i)
  if (m) f.vencimento = m[1]

  // ---- Repartição OFICIAL: "Total Geral da Empresa" ----
  let repart: Record<string, string> = {}
  const idxTotal = text.search(/Total\s+Geral\s+da\s+Empresa/i)
  const officialSlice = idxTotal >= 0 ? text.slice(idxTotal) : text
  const official = readRepart(officialSlice)
  if (official) {
    repart = official.repart
    f.dasOfficial = official.total
  }

  // ---- Atividades (segregação) ----
  const atividades: PgdasAtividade[] = []
  const blocks = text.split(/Valor\s+do\s+D[ée]bito\s+por\s+Tributo\s+para\s+a\s+Atividade/i)
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i]
    const rp = readRepart(b)
    if (!rp) continue
    const descM = b.match(/^[^\n]*?\(R\$\)\s*:?\s*([\s\S]*?)Receita\s+Bruta\s+Informada/i)
    const descricao = (descM ? descM[1] : "").replace(/\s+/g, " ").trim()
    const recM = b.match(/Receita\s+Bruta\s+Informada[:\s]*R?\$?\s*([\d.]+,\d{2})/i)
    const subST = /Com\s+substitui[çc][ãa]o\s+tribut[áa]ria/i.test(descricao) || /Substitui[çc][ãa]o\s+tribut[áa]ria\s+de:\s*ICMS/i.test(b)
    const mono = /Tributa[çc][ãa]o\s+monof[áa]sica\s+de:/i.test(b)
    atividades.push({ descricao, receita: recM ? recM[1] : "", repart: rp.repart, total: rp.total, substituicaoICMS: subST, monofasica: mono })
  }

  if (!official) {
    const first = atividades[0] ? { repart: atividades[0].repart, total: atividades[0].total } : readRepart(text)
    if (first) {
      repart = first.repart
      f.dasOfficial = first.total
      if (atividades.length > 1) warnings.push("Não localizei o 'Total Geral da Empresa'; a repartição pode estar incompleta.")
    }
  }

  if (!Object.keys(repart).length) return null

  const issN = parseBR(repart.ISS), ipiN = parseBR(repart.IPI), icmsN = parseBR(repart.ICMS)
  f.atividade = issN > 0 ? "Serviços" : ipiN > 0 ? "Indústria" : icmsN > 0 ? "Comércio" : "Serviços"
  if (!f.anexo) f.anexo = issN > 0 ? "Anexo III" : ipiN > 0 ? "Anexo II" : "Anexo I"

  const seg: PgdasSegregacao = { icmsNormal: 0, icmsST: 0, issTotal: issN, pisCofinsMonofasico: 0, pisCofinsNormal: 0 }
  if (atividades.length) {
    for (const a of atividades) {
      const icms = parseBR(a.repart.ICMS)
      const pisCofins = parseBR(a.repart.COFINS) + parseBR(a.repart["PIS/PASEP"])
      if (a.substituicaoICMS) seg.icmsST += icms
      else seg.icmsNormal += icms
      if (a.monofasica) seg.pisCofinsMonofasico += pisCofins
      else seg.pisCofinsNormal += pisCofins
    }
  } else {
    seg.icmsNormal = icmsN
    seg.pisCofinsNormal = parseBR(repart.COFINS) + parseBR(repart["PIS/PASEP"])
  }

  const somaTrib = TRIB_ORDER.reduce((s, k) => s + parseBR(repart[k]), 0)
  const tot = parseBR(f.dasOfficial)
  if (tot > 0 && Math.abs(somaTrib - tot) > 0.05)
    warnings.push(`Soma dos tributos (${somaTrib.toFixed(2)}) diverge do total declarado (${tot.toFixed(2)}).`)
  if (f.fatorRDecl && f.folha12m && f.rbt12) {
    const calc = parseBR(f.rbt12) > 0 ? (parseBR(f.folha12m) / parseBR(f.rbt12)) * 100 : 0
    const decl = parseBR(f.fatorRDecl) * 100
    if (Math.abs(calc - decl) > 1.0)
      warnings.push(`Fator R declarado (${decl.toFixed(0)}%) diverge do calculado folha/RBT12 (${calc.toFixed(1)}%).`)
  }

  if (!f.revenue && !atividades.length) return null
  return { fields: f, repart, atividades, seg, warnings }
}
