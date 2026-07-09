// Leitor da Declaração/Extrato do PGDAS-D.
// Recebe o texto extraído do PDF e devolve os campos + a repartição exata dos tributos,
// com:
//   • Repartição "oficial" lida da seção "Total Geral da Empresa" (soma correta mesmo
//     com várias atividades).
//   • Segregação por atividade → ICMS normal × ICMS-ST e PIS/COFINS monofásico
//     (flags "Substituição tributária de:" / "Tributação monofásica de:").
//   • Fator r tratando "Não se aplica" e conferindo com folha12m / RBT12.
//   • warnings[] avisando divergências (soma ≠ DAS, Fator R divergente).
import { parseBR, fmtNum } from "./format"

export interface PgdasAtividade {
  descricao: string
  receita: string
  repart: Record<string, string>
  total: string
  substituicaoICMS: boolean
  monofasica: boolean
  /** Anexo inferido da repartição da atividade (ISS→III, IPI→II, ICMS→I). */
  anexo?: string
  /** Receita das PARCELAS monofásicas da atividade (PIS/COFINS zero) — precisão por
   *  parcela: uma atividade pode ter parcelas ST, monofásicas ou as duas. */
  receitaMonofasica: string
  /** Receita das PARCELAS em ICMS-ST (ICMS já recolhido, sem débito próprio). */
  receitaST: string
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

  // Nome empresarial (2 passos p/ previsibilidade): pega uma janela após o rótulo
  // (cruzando quebra de linha — o nome pode vir em 2 linhas) e corta no PRIMEIRO campo
  // vizinho (CNPJ, Data de Abertura, etc.) ou no número do CNPJ. Não corta em espaços
  // internos: a extração do PDF gera gaps dentro da razão social (o que truncava "JAB").
  let m = text.match(/Nome\s+[eE]mpresarial\s*[:\-]?\s*([\s\S]{0,120})/i)
  if (m) {
    let nome = m[1]
    const stop = nome.match(/\s*(?:CNPJ|CPF\b|Data\s+de\s+[aA]bertura|Optante\b|Regime\s+de\b|Situa[çc][ãa]o\b|Per[ií]odo\s+de|Ente\s+Federado|Qualifica[çc][ãa]o|Nome\s+Fantasia|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i)
    if (stop && stop.index !== undefined && stop.index > 0) nome = nome.slice(0, stop.index)
    f.clientName = nome.replace(/\s+/g, " ").trim()
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
    // Segregação POR PARCELA: cada parcela pode ser ST, monofásica ou as duas. Soma
    // separadamente a receita das parcelas monofásicas (PIS/COFINS zero) e das em ST (ICMS
    // já recolhido, sem débito) — assim uma atividade parte-ST/parte-monofásica não exclui
    // demais de nenhuma das bases.
    let recMonoParc = 0, recStParc = 0, temParcela = false
    for (const seg of b.split(/Parcela\s+\d+\s*:/i).slice(1)) {
      const vm = seg.match(/R?\$?\s*([\d.]+,\d{2})/)
      if (!vm) continue
      temParcela = true
      const val = parseBR(vm[1])
      if (/Tributa[çc][ãa]o\s+monof[áa]sica\s+de:/i.test(seg)) recMonoParc += val
      if (/Substitui[çc][ãa]o\s+tribut[áa]ria\s+de:/i.test(seg)) recStParc += val
    }
    const receitaBruta = recM ? recM[1] : ""
    // Fallback: sem parcelas itemizadas mas bloco marcado → receita toda.
    const receitaMonofasica = fmtNum(temParcela ? recMonoParc : (mono ? parseBR(receitaBruta) : 0))
    const receitaST = fmtNum(temParcela ? recStParc : (subST ? parseBR(receitaBruta) : 0))
    // Anexo da atividade pela repartição: ISS→serviços, IPI→indústria (II), ICMS→comércio (I).
    // Serviço: se o extrato já indicou Anexo IV ou V (Fator R), respeita; senão III.
    const anexoServ = f.anexo === "Anexo IV" || f.anexo === "Anexo V" ? f.anexo : "Anexo III"
    const anexo = parseBR(rp.repart.ISS) > 0 ? anexoServ : parseBR(rp.repart.IPI) > 0 ? "Anexo II" : parseBR(rp.repart.ICMS) > 0 ? "Anexo I" : undefined
    atividades.push({ descricao, receita: receitaBruta, repart: rp.repart, total: rp.total, substituicaoICMS: subST, monofasica: mono, anexo, receitaMonofasica, receitaST })
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
  // Atividade e anexo default CONSISTENTES entre si (issN→Serviços/III, ipiN→Indústria/II,
  // icmsN→Comércio/I; all-zero → Serviços/III).
  f.atividade = issN > 0 ? "Serviços" : ipiN > 0 ? "Indústria" : icmsN > 0 ? "Comércio" : "Serviços"
  if (!f.anexo) f.anexo = ipiN > 0 ? "Anexo II" : icmsN > 0 ? "Anexo I" : "Anexo III"

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
