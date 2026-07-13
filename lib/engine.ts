// Motor de apuração fiscal (LC 123/2006 + Resolução CGSN 140/2018).
// Simples Anexos I–V com Fator R, Lucro Presumido/Real, MEI, retenções e
// simulação de regime para a comparação de economia. Monetários em string pt-BR.
import { parseBR, fmtNum } from "./format"
import { PARAMETROS_PADRAO, difalMASNPercent, type ParametrosFiscais } from "./config"
import type { Apuracao, ApuracaoAtividade, Atividade, ClientData, Economia, LpInfo, MeiInfo, RepartItem, SnInfo, TaxRow } from "./types"

/** Conversões entre anexo (Simples) e tipo de atividade (Lucro Presumido). */
const tipoDoAnexo = (anexo?: string): Atividade => (anexo === "Anexo I" ? "Comércio" : anexo === "Anexo II" ? "Indústria" : "Serviços")
const anexoDoTipo = (tipo?: Atividade): string => (tipo === "Comércio" ? "Anexo I" : tipo === "Indústria" ? "Anexo II" : "Anexo III")

/** Base de cálculo presumida do LP com a majoração da LC 224/2025 (presunção +X%
 *  na parcela de receita acima do limite anual; proporção mensal = limite/12). */
function baseLP(revenue: number, presFrac: number, p: ParametrosFiscais): number {
  if (!p.majoracaoAtiva || p.majoracaoLimiteAnual <= 0) return revenue * presFrac
  const lim = p.majoracaoLimiteAnual / 12
  return Math.min(revenue, lim) * presFrac + Math.max(0, revenue - lim) * presFrac * (1 + p.majoracaoPct / 100)
}

/* ===== IRRF mensal 2026 — tabela progressiva base + redutor da isenção =====
 * Base progressiva [limite, alíquota %, parcela a deduzir]. Sobre ela, o redutor
 * de 2026 garante isenção efetiva até R$ 5.000/mês e redução parcial até R$ 7.350. */
const IRRF_FAIXAS_2026: [number, number, number][] = [
  [2259.20, 0, 0],
  [2826.65, 7.5, 169.44],
  [3751.05, 15, 381.44],
  [4664.68, 22.5, 662.77],
  [Infinity, 27.5, 896.00],
]
export const IRRF_DEP_2026 = 189.59      // dedução mensal por dependente
export const IRRF_SIMPLES_2026 = 607.20  // desconto simplificado mensal (alternativo)
export const IRRF_ISENCAO_2026 = 5000    // isenção efetiva até este rendimento
export const IRRF_REDUTOR_TETO_2026 = 7350 // redutor parcial até este rendimento

/** IRRF mensal 2026 sobre `rendimento`, dados o INSS e o nº de dependentes.
 *  Usa a maior dedução (legais: INSS + dependentes × 189,59  ×  simplificado 607,20),
 *  aplica a tabela progressiva e o redutor da isenção (até 5k zero; parcial até 7.350). */
export function calcIRRF2026(rendimento: number, inss: number, dependentes = 0): number {
  if (rendimento <= 0) return 0
  if (rendimento <= IRRF_ISENCAO_2026) return 0
  const deducao = Math.max(inss + dependentes * IRRF_DEP_2026, IRRF_SIMPLES_2026)
  const base = rendimento - deducao
  if (base <= 0) return 0
  const f = IRRF_FAIXAS_2026.find((x) => base <= x[0]) || IRRF_FAIXAS_2026[IRRF_FAIXAS_2026.length - 1]
  let imposto = Math.max(0, (base * f[1]) / 100 - f[2])
  if (rendimento <= IRRF_REDUTOR_TETO_2026) imposto = Math.max(0, imposto - (978.62 - 0.133145 * rendimento))
  return Math.round(imposto * 100) / 100
}

/* ===== Tabelas do Simples Nacional — [limite RBT12, alíquota nominal %, parcela a deduzir] ===== */
export const SN_TAB: Record<string, [number, number, number][]> = {
  "Anexo I": [[180000, 4.0, 0], [360000, 7.3, 5940], [720000, 9.5, 13860], [1800000, 10.7, 22500], [3600000, 14.3, 87300], [4800000, 19.0, 378000]],
  "Anexo II": [[180000, 4.5, 0], [360000, 7.8, 5940], [720000, 10.0, 13860], [1800000, 11.2, 22500], [3600000, 14.7, 85500], [4800000, 30.0, 720000]],
  "Anexo III": [[180000, 6.0, 0], [360000, 11.2, 9360], [720000, 13.5, 17640], [1800000, 16.0, 35640], [3600000, 21.0, 125640], [4800000, 33.0, 648000]],
  "Anexo IV": [[180000, 4.5, 0], [360000, 9.0, 8100], [720000, 10.2, 12420], [1800000, 14.0, 39780], [3600000, 22.0, 183780], [4800000, 33.0, 828000]],
  "Anexo V": [[180000, 15.5, 0], [360000, 18.0, 4500], [720000, 19.5, 9900], [1800000, 20.5, 17100], [3600000, 23.0, 62100], [4800000, 30.5, 540000]],
}

// Repartição dos tributos DENTRO do DAS, por anexo e faixa.
//   • Anexo II (indústria) inclui IPI → 7 componentes.
//   • Anexo IV (serviços) NÃO tem CPP no DAS → 5 componentes (CPP patronal por fora).
export const SN_REPART_DEF: Record<string, { labels: string[]; faixas: number[][] }> = {
  "Anexo I": {
    labels: ["IRPJ", "CSLL", "COFINS", "PIS/PASEP", "CPP", "ICMS"],
    faixas: [
      [5.5, 3.5, 12.74, 2.76, 41.5, 34.0],
      [5.5, 3.5, 12.74, 2.76, 41.5, 34.0],
      [5.5, 3.5, 12.74, 2.76, 42.0, 33.5],
      [5.5, 3.5, 12.74, 2.76, 42.0, 33.5],
      [5.5, 3.5, 12.74, 2.76, 42.0, 33.5],
      [13.5, 10.0, 28.27, 6.13, 42.1, 0],
    ],
  },
  "Anexo II": {
    labels: ["IRPJ", "CSLL", "COFINS", "PIS/PASEP", "CPP", "IPI", "ICMS"],
    faixas: [
      [5.5, 3.5, 11.51, 2.49, 37.5, 7.5, 32.0],
      [5.5, 3.5, 11.51, 2.49, 37.5, 7.5, 32.0],
      [5.5, 3.5, 11.51, 2.49, 37.5, 7.5, 32.0],
      [5.5, 3.5, 11.51, 2.49, 37.5, 7.5, 32.0],
      [5.5, 3.5, 11.51, 2.49, 37.5, 7.5, 32.0],
      [8.5, 7.5, 20.96, 4.54, 23.5, 35.0, 0],
    ],
  },
  "Anexo III": {
    labels: ["IRPJ", "CSLL", "COFINS", "PIS/PASEP", "CPP", "ISS"],
    faixas: [
      [4.0, 3.5, 12.82, 2.78, 43.4, 33.5],
      [4.0, 3.5, 14.05, 3.05, 43.4, 32.0],
      [4.0, 3.5, 13.64, 2.96, 43.4, 32.5],
      [4.0, 3.5, 13.64, 2.96, 43.4, 32.5],
      [4.0, 3.5, 12.82, 2.78, 43.4, 33.5],
      [35.0, 15.0, 16.03, 3.47, 30.5, 0],
    ],
  },
  "Anexo IV": {
    labels: ["IRPJ", "CSLL", "COFINS", "PIS/PASEP", "ISS"],
    faixas: [
      [18.8, 15.2, 17.67, 3.83, 44.5],
      [19.8, 15.2, 20.55, 4.45, 40.0],
      [20.8, 15.2, 19.73, 4.27, 40.0],
      [17.8, 19.2, 18.9, 4.1, 40.0],
      [18.8, 19.2, 18.08, 3.92, 40.0],
      [53.5, 21.5, 20.55, 4.45, 0],
    ],
  },
  "Anexo V": {
    labels: ["IRPJ", "CSLL", "COFINS", "PIS/PASEP", "CPP", "ISS"],
    faixas: [
      [25.0, 15.0, 14.1, 3.05, 28.85, 14.0],
      [23.0, 15.0, 14.1, 3.05, 27.85, 17.0],
      [24.0, 15.0, 14.92, 3.23, 23.85, 19.0],
      [21.0, 15.0, 15.74, 3.41, 23.85, 21.0],
      [23.0, 12.5, 14.1, 3.05, 23.85, 23.5],
      [35.0, 15.5, 16.44, 3.56, 29.5, 0],
    ],
  },
}

export const calcSN = (rbt12: number, anexo: string) => {
  const tab = SN_TAB[anexo]
  if (!tab || rbt12 <= 0) return { rate: 0, nominal: 0, deducao: 0, faixa: 0 }
  const idx = tab.findIndex((f) => rbt12 <= f[0])
  const fi = idx === -1 ? tab.length - 1 : idx
  const f = tab[fi]
  const eff = ((rbt12 * (f[1] / 100)) - f[2]) / rbt12 * 100
  return { rate: Math.max(eff, 0), nominal: f[1], deducao: f[2], faixa: fi + 1 }
}
export const calcFatorR = (folha12: number, rbt12: number): number => (!rbt12 || rbt12 <= 0 ? 0 : (folha12 / rbt12) * 100)
export const anexoEfetivo = (anexo: string, fatorR: number, sujeitoFatorR = false): string => {
  // Atividade sujeita ao Fator R (serviços intelectuais, §5º-I da LC 123): o anexo é
  // DETERMINADO pelo teste — Anexo III se Fator R ≥ 28%, Anexo V se < 28%. O operador não
  // escolhe III ou V; o sistema decide pela folha de cada mês (não existe "Anexo V fixo").
  if (sujeitoFatorR) return fatorR >= 28 ? "Anexo III" : "Anexo V"
  // Não sujeita ao Fator R: usa o anexo fixo escolhido (I, II, III §5º-B, ou IV).
  return anexo
}
export const repartirDAS = (das: number, anexo: string, faixa: number): RepartItem[] => {
  const def = SN_REPART_DEF[anexo]
  if (!def || das <= 0) return []
  const perc = def.faixas[Math.max(0, Math.min(def.faixas.length - 1, faixa - 1))]
  return def.labels
    .map((tax, i) => ({ tax, pct: perc[i] || 0, value: (das * (perc[i] || 0)) / 100 }))
    .filter((r) => r.value > 0.005)
}

/* ===== Previdência ===== */
// Teto do salário-de-contribuição do INSS (2026): a contribuição do sócio
// (11% sobre o pró-labore) é limitada a este teto.
export const TETO_INSS_2026 = 8475.55

/* ===== MEI (SIMEI — DAS fixo mensal) ===== */
export const MEI_SALARIO_MIN_2026 = 1621 // salário mínimo de 2026
export const MEI_LIMITE_ANUAL = 81000
const MEI_INSS_2026 = Math.round(MEI_SALARIO_MIN_2026 * 0.05 * 100) / 100
export const MEI_CATEGORIAS = ["Comércio/Indústria", "Serviços", "Comércio e Serviços"] as const
export const MEI_DAS_2026: Record<string, { das: number; inss: number; icms: number; iss: number }> = {
  "Comércio/Indústria": { das: MEI_INSS_2026 + 1, inss: MEI_INSS_2026, icms: 1, iss: 0 },
  Serviços: { das: MEI_INSS_2026 + 5, inss: MEI_INSS_2026, icms: 0, iss: 5 },
  "Comércio e Serviços": { das: MEI_INSS_2026 + 6, inss: MEI_INSS_2026, icms: 1, iss: 5 },
}
export const meiComposicao = (categoria: string, das: number): RepartItem[] => {
  const def = MEI_DAS_2026[categoria] || MEI_DAS_2026["Comércio/Indústria"]
  const ratio = def.das > 0 ? das / def.das : 1
  const out: RepartItem[] = []
  if (def.inss > 0) out.push({ tax: "INSS", pct: (def.inss / def.das) * 100, value: def.inss * ratio })
  if (def.icms > 0) out.push({ tax: "ICMS", pct: (def.icms / def.das) * 100, value: def.icms * ratio })
  if (def.iss > 0) out.push({ tax: "ISS", pct: (def.iss / def.das) * 100, value: def.iss * ratio })
  return out
}

/* ===== Vencimentos ===== */
// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) — base dos feriados móveis.
function pascoa(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const mm = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * mm + 114) / 31)
  const dia = ((h + l - 7 * mm + 114) % 31) + 1
  return new Date(year, mes - 1, dia)
}
const mmdd = (dt: Date) => `${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
const _feriadosCache: Record<number, Set<string>> = {}
/** Feriados nacionais do ano como "MM-DD". Fixos (Lei 662/1949, 6.802, 14.759/2023) +
 *  Sexta-feira Santa (feriado nacional) + Carnaval seg/ter e Corpus Christi (ponto
 *  facultativo bancário — bancos não processam, então DAS/DARF também deslocam). */
export function feriadosNacionais(year: number): Set<string> {
  if (_feriadosCache[year]) return _feriadosCache[year]
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"]
  const p = pascoa(year)
  const desloca = (dias: number) => { const dt = new Date(p); dt.setDate(dt.getDate() + dias); return mmdd(dt) }
  const moveis = [desloca(-2), desloca(-48), desloca(-47), desloca(60)] // Sexta Santa, Carnaval (seg/ter), Corpus Christi
  const set = new Set([...fixos, ...moveis])
  _feriadosCache[year] = set
  return set
}
/** Dia sem expediente: sábado, domingo ou feriado nacional. */
const ehDiaNaoUtil = (dt: Date): boolean =>
  dt.getDay() === 0 || dt.getDay() === 6 || feriadosNacionais(dt.getFullYear()).has(mmdd(dt))

const lastBizDay = (m: number, y: number): number => {
  const d = new Date(y, m, 0)
  while (ehDiaNaoUtil(d)) d.setDate(d.getDate() - 1)
  return d.getDate()
}
// Ajusta um vencimento que cai em dia não útil: "next" PRORROGA (DAS/DAS-MEI),
// "prev" ANTECIPA (demais). Laço p/ pular fins de semana + feriados encadeados
// (ex.: sexta-feira feriado seguida de fim de semana).
export const adjustWeekend = (y: number, m: number, d: number, mode: "next" | "prev"): Date => {
  const dt = new Date(y, m - 1, d)
  const passo = mode === "prev" ? -1 : 1
  while (ehDiaNaoUtil(dt)) dt.setDate(dt.getDate() + passo)
  return dt
}
export const dueDate = (compMonth?: string, compYear?: string, tax = ""): string => {
  if (!compMonth || !compYear) return ""
  const m = parseInt(compMonth)
  const y = parseInt(compYear)
  let nm = m + 1
  let ny = y
  if (nm > 12) { nm = 1; ny++ }
  const pad = (n: number) => String(n).padStart(2, "0")
  const fmt = (dt: Date) => `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`
  if (["IRPJ", "CSLL", "Adicional IRPJ"].includes(tax)) {
    // Lucro Presumido: apuração TRIMESTRAL. A quota única (ou 1ª de 3) vence no último
    // dia útil do mês seguinte ao encerramento do trimestre (mês 3, 6, 9 ou 12).
    const qe = Math.ceil(m / 3) * 3
    let dm = qe + 1, dy = y
    if (dm > 12) { dm = 1; dy++ }
    return `${pad(lastBizDay(dm, dy))}/${pad(dm)}/${dy}`
  }
  const map: Record<string, number> = {
    PIS: 25, COFINS: 25, ISS: 10, "ISS (próprio)": 10, "INSS (Pró-labore)": 20,
    "CPP (Patronal)": 20, RAT: 20, Terceiros: 20, FGTS: 20, DAS: 20, "DAS-MEI": 20, ICMS: 20, IRRF: 20,
    "INSS (Folha)": 20, "IRRF (Folha)": 20, "IRRF (Pró-labore)": 20,
  }
  const dia = map[tax]
  if (!dia) return ""
  // Só o DAS (Simples) e o DAS-MEI PRORROGAM para o próximo dia útil quando o
  // vencimento cai em dia não útil. Os demais (PIS, COFINS, IRRF, INSS, CPP, RAT,
  // Terceiros, FGTS, ICMS, ISS) ANTECIPAM para o dia útil anterior
  // (art. 18, parág. único, MP 2.158-35/2001; FGTS Digital segue a mesma regra).
  const prorroga = tax === "DAS" || tax === "DAS-MEI"
  return fmt(adjustWeekend(ny, nm, dia, prorroga ? "next" : "prev"))
}

/* ===== Motor de apuração ===== */
export function computeApuracao(cd: ClientData, params: ParametrosFiscais = PARAMETROS_PADRAO): Apuracao {
  const regime = cd.regime || "Lucro Presumido"
  const atividade = cd.atividade || "Serviços"
  // Múltiplas atividades (opcional): só conta linhas com RECEITA > 0. Linhas em branco
  // (ex.: descrição digitada, receita ainda vazia) não ligam o modo multiatividade nem
  // poluem as bases/o comparativo — evita "atividade fantasma".
  const atividadesIn = (cd.atividades || []).filter((a) => parseBR(a.receita) > 0)
  const multiAtiv = atividadesIn.length > 0
  const revenue = multiAtiv ? atividadesIn.reduce((s, a) => s + parseBR(a.receita), 0) : parseBR(cd.revenue)
  let apAtividades: ApuracaoAtividade[] | undefined
  const proLabore = parseBR(cd.proLabore)
  const folhaMensal = parseBR(cd.folhaMensal)
  const ret = cd.ret || {}
  const taxes: TaxRow[] = []
  // Anexo III só é sujeito ao Fator R quando o operador marca; Anexo V é sempre sujeito.
  const sujeitoFatorR = !!cd.sujeitoFatorR

  // ---------- SIMPLES NACIONAL ----------
  let sn: SnInfo | null = null
  if (regime === "Simples Nacional") {
    // Robustez: sem RBT12 informado (entrada manual incompleta), anualiza a receita
    // do mês como proxy — evita faixa/DAS zerados ("0ª faixa", carga 0%) quando há
    // faturamento. O PGDAS-D sempre preenche o RBT12, então o fallback só atua na
    // digitação manual incompleta.
    let rbt12 = parseBR(cd.rbt12)
    const rbt12Estimado = rbt12 <= 0 && revenue > 0
    if (rbt12Estimado) rbt12 = revenue * 12
    const folha12 = parseBR(cd.folha12m)
    const fatorR = calcFatorR(folha12, rbt12)
    const anexoBase = cd.anexo || "Anexo III"
    const anexoEf = anexoEfetivo(anexoBase, fatorR, sujeitoFatorR)
    const r = calcSN(rbt12, anexoEf)
    // Multiatividade: DAS calculado = soma por atividade (cada uma na tabela do seu anexo).
    const anexoDe = (a: (typeof atividadesIn)[number]) => a.anexo || anexoDoTipo(a.tipo) || anexoEf
    const dasCalc = multiAtiv
      ? atividadesIn.reduce((s, a) => s + parseBR(a.receita) * (calcSN(rbt12, anexoDe(a)).rate / 100), 0)
      : (revenue * r.rate) / 100
    // Quando importado do PGDAS-D, o DAS oficial já considera ICMS-ST e PIS/COFINS
    // monofásico (que reduzem o valor). Nesses casos confiamos no extrato, não no
    // recálculo pela alíquota cheia. Sem extrato (entrada manual), usa o calculado.
    const dasOff = parseBR(cd.overrides?.["DAS"]?.value || cd.dasOfficial)
    const usaOficial = dasOff > 0.005
    const das = usaOficial ? dasOff : dasCalc
    const rateEf = revenue > 0 ? (das / revenue) * 100 : r.rate
    sn = { rbt12, folha12, fatorR, anexoBase, anexoEf, rate: rateEf, nominal: r.nominal, deducao: r.deducao, faixa: r.faixa, das, dasNominal: dasCalc, repart: [] }

    taxes.push({
      tax: "DAS", base: fmtNum(revenue), rate: rateEf.toFixed(2).replace(".", ","),
      apurado: fmtNum(das), retido: "", value: fmtNum(das),
      dueDate: dueDate(cd.compMonth, cd.compYear, "DAS"),
      obs: usaOficial
        ? `${anexoEf} • Faixa ${r.faixa} • valor do PGDAS-D (segregação ICMS-ST / monofásico aplicada)`
        : `${anexoEf} • Faixa ${r.faixa} • Alíq. nominal ${r.nominal.toFixed(2).replace(".", ",")}%${rbt12Estimado ? " • RBT12 estimado (receita×12) — informe o acumulado 12m p/ exatidão" : ""}`,
      group: "DAS",
    })
    let repart = repartirDAS(das, anexoEf, r.faixa)
    if (cd.repartManual) {
      const rm = cd.repartManual
      repart = repart.map((x) => {
        const ov = rm[x.tax]
        return ov !== undefined && ov !== "" ? { ...x, value: parseBR(ov), pct: das > 0 ? (parseBR(ov) / das) * 100 : 0 } : x
      })
    }
    sn.repart = repart
    // Tabela "Receita e DAS por atividade" (só quando há mais de uma).
    if (multiAtiv) {
      apAtividades = atividadesIn.map((a) => {
        const ax = anexoDe(a)
        const dasA = a.dasAtividade && parseBR(a.dasAtividade) > 0
          ? parseBR(a.dasAtividade)
          : parseBR(a.receita) * (calcSN(rbt12, ax).rate / 100)
        return { descricao: a.descricao || ax, receita: parseBR(a.receita), anexo: ax, valor: dasA, substituicaoICMS: a.substituicaoICMS, monofasica: a.monofasica }
      })
    }

    // ---------- ICMS DIFAL (compras interestaduais — MA, Lei 8.948/2009) ----------
    // Antecipação do diferencial de alíquota sobre AQUISIÇÕES interestaduais: percentual
    // por faixa de RBT12 aplicado ao valor das compras. Só comércio/indústria (aquisição
    // p/ revenda/industrialização), inclusive empresa mista. É custo do Simples: entra na
    // carga efetiva; no comparativo, aparece só no lado Simples (o LP não paga esse DIFAL).
    const comprasInter = parseBR(cd.comprasInterestaduais)
    const temComIndSN = atividade !== "Serviços" || atividadesIn.some((a) => {
      const ax = a.anexo || anexoDoTipo(a.tipo)
      return ax === "Anexo I" || ax === "Anexo II"
    })
    if (comprasInter > 0 && temComIndSN) {
      const pctDifal = difalMASNPercent(rbt12)
      if (pctDifal && pctDifal > 0) {
        const difal = comprasInter * (pctDifal / 100)
        taxes.push({
          tax: "ICMS DIFAL", base: fmtNum(comprasInter), rate: pctDifal.toFixed(2).replace(".", ","),
          apurado: fmtNum(difal), retido: "", value: fmtNum(difal),
          dueDate: dueDate(cd.compMonth, cd.compYear, "ICMS"),
          obs: `Antecipação s/ compras interestaduais • ${pctDifal.toFixed(2).replace(".", ",")}% (RBT12) • MA Lei 8.948/2009`,
          group: "ICMS",
        })
      }
    }
  }

  // ---------- MEI ----------
  let mei: MeiInfo | null = null
  if (regime === "MEI") {
    const categoria = cd.meiCategoria || "Comércio/Indústria"
    const def = MEI_DAS_2026[categoria] || MEI_DAS_2026["Comércio/Indústria"]
    const das = cd.meiDasFixo ? parseBR(cd.meiDasFixo) : def.das
    mei = { das, categoria, repart: meiComposicao(categoria, das), limiteAnual: MEI_LIMITE_ANUAL }
    taxes.push({
      tax: "DAS-MEI", base: fmtNum(revenue),
      rate: revenue > 0 ? ((das / revenue) * 100).toFixed(2).replace(".", ",") : "",
      apurado: fmtNum(das), retido: "", value: fmtNum(das),
      dueDate: dueDate(cd.compMonth, cd.compYear, "DAS-MEI"),
      obs: `SIMEI • ${categoria} • valor fixo mensal`, group: "DAS",
    })
  }

  // ---------- LUCRO PRESUMIDO / REAL ----------
  let lp: LpInfo | null = null
  if (regime === "Lucro Presumido" || regime === "Lucro Real") {
    const tipoDe = (a: (typeof atividadesIn)[number]) => a.tipo || tipoDoAnexo(a.anexo)
    // Equiparação hospitalar: presunção reduzida (8%/12%) nas atividades de SERVIÇO — vale
    // tanto p/ serviço único (clínica) quanto p/ as linhas de serviço no multiatividade.
    const equipFlag = !!cd.equipHospitalar
    const pIrpjTipo = (t: Atividade) => (equipFlag && t === "Serviços" ? 0.08 : (t === "Serviços" ? params.presIrpjServicos : params.presIrpjComercio) / 100)
    const pCsllTipo = (t: Atividade) => (equipFlag && t === "Serviços" ? 0.12 : (t === "Serviços" ? params.presCsllServicos : params.presCsllComercio) / 100)
    const temServico = atividade === "Serviços" || (multiAtiv && atividadesIn.some((a) => tipoDe(a) === "Serviços"))
    const equip = equipFlag && temServico
    const pIrpj = pIrpjTipo(atividade)
    const pCsll = pCsllTipo(atividade)
    // IRPJ/CSLL trimestrais → receita MENSAL-EQUIVALENTE (receita do trimestre ÷ 3, ou a do
    // mês). No multiatividade, escala as receitas das atividades pela mesma proporção
    // (`scaleLP`): preserva o mix de presunção e suaviza o adicional (que incide sobre a base
    // mensal-equivalente). O limite do adicional (R$ 20.000/mês) = R$ 60.000/trimestre.
    const recTrim = parseBR(cd.receitaTrimestre)
    const mesEquiv = recTrim > 0 ? recTrim / 3 : revenue
    const scaleLP = revenue > 0 ? mesEquiv / revenue : 1
    const baseIrpj = multiAtiv
      ? atividadesIn.reduce((s, a) => s + baseLP(parseBR(a.receita) * scaleLP, pIrpjTipo(tipoDe(a)), params), 0)
      : baseLP(mesEquiv, pIrpj, params)
    const baseCsll = multiAtiv
      ? atividadesIn.reduce((s, a) => s + baseLP(parseBR(a.receita) * scaleLP, pCsllTipo(tipoDe(a)), params), 0)
      : baseLP(mesEquiv, pCsll, params)
    const irpj = baseIrpj * (params.irpjRate / 100)
    const adic = Math.max(0, baseIrpj - params.irpjAdicLimiteMensal) * (params.irpjAdicRate / 100)
    const csll = baseCsll * (params.csllRate / 100)
    // Base do ISS: em multiatividade só a receita das linhas de serviço.
    const recServ = multiAtiv
      ? atividadesIn.filter((a) => tipoDe(a) === "Serviços").reduce((s, a) => s + parseBR(a.receita), 0)
      : (atividade === "Serviços" ? revenue : 0)
    const issRate = cd.issRate ? parseBR(cd.issRate) : (recServ > 0 ? params.issPadrao : 0)
    // Receita de serviço mensal-equivalente sujeita à equiparação (p/ o painel de economia).
    const equipRevenue = equip ? (multiAtiv ? recServ * scaleLP : mesEquiv) : 0
    lp = { equip, pIrpj, pCsll, baseIrpj, baseCsll, irpj, adic, csll, issRate, equipRevenue }
    if (multiAtiv) {
      apAtividades = atividadesIn.map((a) => {
        const t = tipoDe(a)
        return { descricao: a.descricao || t, receita: parseBR(a.receita), tipo: t, valor: baseLP(parseBR(a.receita), pIrpjTipo(t), params) }
      })
    }

    const pushLP = (tax: string, base: number, rate: number, valor: number, obs: string, group: string, dueTax?: string) => {
      taxes.push({
        tax, base: fmtNum(base), rate: rate.toFixed(2).replace(".", ","),
        apurado: fmtNum(valor), retido: "", value: fmtNum(valor),
        dueDate: dueDate(cd.compMonth, cd.compYear, dueTax || tax), obs, group,
      })
    }
    // Base de PIS/COFINS líquida da revenda monofásica (essa parte já foi tributada na
    // origem, alíquota zero na revenda). Vem das atividades marcadas como monofásicas
    // no PGDAS-D — torna a projeção exata sem digitar nada a mais.
    // Receita monofásica: usa o valor por parcela (preciso) quando disponível; senão cai
    // no flag da atividade inteira (entrada manual / rascunhos antigos sem o campo).
    // Atividade ÚNICA (sem tabela por atividade): usa o total segregado guardado do
    // PGDAS-D (segReceitaMono) — assim a revenda monofásica também é excluída da base.
    const recMonofasica = multiAtiv
      ? atividadesIn.reduce((s, a) => s + (a.receitaMonofasica ? parseBR(a.receitaMonofasica) : (a.monofasica ? parseBR(a.receita) : 0)), 0)
      : Math.max(0, cd.segReceitaMono || 0)
    const basePisCofins = Math.max(0, revenue - recMonofasica)
    const monoNota = recMonofasica > 0 ? ` • base líquida de monofásico (−${fmtNum(recMonofasica)})` : ""
    pushLP("PIS", basePisCofins, params.pisCumulativo, basePisCofins * (params.pisCumulativo / 100), `Regime cumulativo (${params.pisCumulativo.toFixed(2).replace(".", ",")}%)${monoNota}`, "PIS/COFINS")
    pushLP("COFINS", basePisCofins, params.cofinsCumulativo, basePisCofins * (params.cofinsCumulativo / 100), `Regime cumulativo (${params.cofinsCumulativo.toFixed(2).replace(".", ",")}%)${monoNota}`, "PIS/COFINS")
    if (recServ > 0 && issRate > 0)
      pushLP("ISS", recServ, issRate, (recServ * issRate) / 100, "Imposto municipal sobre serviços", "ISS", "ISS")
    const provNota = recTrim > 0 ? "provisão mensal (1/3 do trimestre)" : "provisão mensal (1/3) — informe a receita do trimestre p/ exatidão"
    const presIrpjNota = multiAtiv ? "Presunção por atividade" : `Presunção ${(pIrpj * 100).toFixed(0)}%${equip ? " (equiparação hospitalar)" : ""}`
    const presCsllNota = multiAtiv ? "Presunção por atividade" : `Presunção ${(pCsll * 100).toFixed(0)}%${equip ? " (equiparação hospitalar)" : ""}`
    pushLP("IRPJ", baseIrpj, params.irpjRate, irpj, `${presIrpjNota} • apuração trimestral · ${provNota}`, "IRPJ/CSLL", "IRPJ")
    if (adic > 0) pushLP("Adicional IRPJ", Math.max(0, baseIrpj - params.irpjAdicLimiteMensal), params.irpjAdicRate, adic, `10% sobre o que excede R$ 60.000/trimestre (base mensal-equiv. acima de R$ ${fmtNum(params.irpjAdicLimiteMensal)})`, "IRPJ/CSLL", "IRPJ")
    pushLP("CSLL", baseCsll, params.csllRate, csll, `${presCsllNota} • apuração trimestral · ${provNota}`, "IRPJ/CSLL", "CSLL")

  }

  // ---------- ENCARGOS DE FOLHA E PRÓ-LABORE (exceto MEI) ----------
  if (regime !== "MEI") {
    const patronalAplica =
      regime === "Lucro Presumido" || regime === "Lucro Real" ||
      (regime === "Simples Nacional" && sn?.anexoEf === "Anexo IV")
    const pushFolha = (tax: string, base: number, rate: number, valor: number, obs: string) => {
      taxes.push({
        tax, base: fmtNum(base), rate: rate.toFixed(2).replace(".", ","),
        apurado: fmtNum(valor), retido: "", value: fmtNum(valor),
        dueDate: dueDate(cd.compMonth, cd.compYear, tax), obs, group: "Folha",
      })
    }
    // FOLHA DE EMPREGADOS — só se houver folha
    if (folhaMensal > 0) {
      pushFolha("FGTS", folhaMensal, 8.0, folhaMensal * 0.08, "Fundo de Garantia (8% sobre a folha)")
      if (patronalAplica) {
        const ratRate = parseBR(cd.ratRate || "1,00")
        pushFolha("RAT", folhaMensal, ratRate, (folhaMensal * ratRate) / 100, "Risco Ambiental do Trabalho (sobre a folha)")
      }
      if (regime === "Lucro Presumido" || regime === "Lucro Real") {
        const terRate = parseBR(cd.terceirosRate || "5,80")
        pushFolha("Terceiros", folhaMensal, terRate, (folhaMensal * terRate) / 100, "Sistema S (sobre a folha)")
      }
    }
    // CPP PATRONAL (folha + pró-labore) — só onde aplica
    const baseCpp = folhaMensal + proLabore
    if (patronalAplica && baseCpp > 0) {
      pushFolha("CPP (Patronal)", baseCpp, 20.0, baseCpp * 0.2, "Contribuição previdenciária patronal (folha + pró-labore)")
    }
    // PRÓ-LABORE — só se houver pró-labore (11% limitado ao teto do INSS)
    if (proLabore > 0) {
      const baseInss = Math.min(proLabore, TETO_INSS_2026)
      const noTeto = proLabore > TETO_INSS_2026
      const inssPro = baseInss * 0.11
      pushFolha("INSS (Pró-labore)", baseInss, 11.0, inssPro,
        noTeto
          ? `Retenção previdenciária do sócio (11% limitado ao teto de R$ ${fmtNum(TETO_INSS_2026)})`
          : "Retenção previdenciária do sócio (11%)")
      // IRRF sobre o pró-labore — tabela mensal 2026 (após INSS e dependentes)
      const irrfPro = calcIRRF2026(proLabore, inssPro, parseInt(cd.proLaboreDeps || "0", 10) || 0)
      if (irrfPro > 0)
        taxes.push({
          tax: "IRRF (Pró-labore)", base: fmtNum(proLabore), rate: "",
          apurado: fmtNum(irrfPro), retido: "", value: fmtNum(irrfPro),
          dueDate: dueDate(cd.compMonth, cd.compYear, "IRRF (Pró-labore)"),
          obs: "IRRF sobre o pró-labore (tabela mensal 2026)", group: "Folha",
        })
    }
    // DIGITADOS (vêm da folha do escritório)
    const inssRet = parseBR(cd.inssRetidoFolha)
    if (inssRet > 0)
      taxes.push({ tax: "INSS (Folha)", base: "", rate: "", apurado: fmtNum(inssRet), retido: "", value: fmtNum(inssRet), dueDate: dueDate(cd.compMonth, cd.compYear, "INSS (Folha)"), obs: "INSS retido dos empregados (GPS)", group: "Folha" })
    const irrf = parseBR(cd.irrfFolha)
    if (irrf > 0)
      taxes.push({ tax: "IRRF (Folha)", base: "", rate: "", apurado: fmtNum(irrf), retido: "", value: fmtNum(irrf), dueDate: dueDate(cd.compMonth, cd.compYear, "IRRF (Folha)"), obs: "IRRF retido da folha (DARF)", group: "Folha" })
  }
  // ICMS digitado (Lucro Presumido comércio/indústria). Também vale quando há atividade
  // de comércio/indústria entre as atividades (empresa mista cujo anexo "principal" é III).
  const temComercioAtiv = multiAtiv && atividadesIn.some((a) => (a.tipo || tipoDoAnexo(a.anexo)) !== "Serviços")
  if ((regime === "Lucro Presumido" || regime === "Lucro Real") && (atividade !== "Serviços" || temComercioAtiv)) {
    const icms = parseBR(cd.icmsRecolher)
    if (icms > 0)
      taxes.push({ tax: "ICMS", base: "", rate: "", apurado: fmtNum(icms), retido: "", value: fmtNum(icms), dueDate: dueDate(cd.compMonth, cd.compYear, "ICMS"), obs: "ICMS a recolher (apuração própria)", group: "ICMS" })
  }

  // ---------- RETENÇÕES NA FONTE ----------
  taxes.forEach((t) => {
    const r = parseBR(ret[t.tax])
    if (r > 0) {
      t.retido = fmtNum(r)
      t.value = fmtNum(Math.max(0, parseBR(t.apurado) - r))
    }
  })

  // ---------- TRIBUTOS ADICIONAIS (manuais) ----------
  ;(cd.extraTaxes || []).forEach((e) => {
    if (!e.tax) return
    const apur = parseBR(e.value)
    const isParc = e.group === "Parcelamento"
    taxes.push({
      tax: e.tax, base: e.base ? fmtNum(e.base) : "", rate: e.rate || "",
      apurado: fmtNum(apur), retido: e.retido ? fmtNum(e.retido) : "",
      value: fmtNum(Math.max(0, apur - parseBR(e.retido))),
      dueDate: e.dueDate || "", obs: e.obs || "", group: e.group || "Outros", manual: true, id: e.id,
      parcela: isParc && e.parcelaNum ? `${e.parcelaNum} de ${e.parcelaTot || "?"}` : undefined,
      // Guias avulsas são tributo do mês (contam por padrão); parcelamentos não.
      contaCompetencia: e.contaCompetencia ?? !isParc,
    })
  })

  // ---------- PENDÊNCIAS COM GUIA EMITIDA (viram guia no caixa do mês) ----------
  // Débitos em aberto que o escritório emite e paga no mês: entram no "Total a recolher"
  // e na lista de guias, sem redigitar. Fora da carga efetiva por padrão (mês anterior).
  ;(cd.pendencias || []).forEach((p) => {
    if (!p.emitiuGuia) return
    const apur = parseBR(p.valor)
    if (apur <= 0) return
    taxes.push({
      tax: p.descricao || "Débito", base: "", rate: "",
      apurado: fmtNum(apur), retido: "", value: fmtNum(apur),
      dueDate: p.vencimento || "",
      obs: p.situacao ? `Débito em aberto · ${p.situacao} · guia emitida` : "Débito em aberto · guia emitida",
      group: "Pendência", manual: true, id: p.id,
      contaCompetencia: p.contaCompetencia ?? false,
    })
  })

  // ---------- AJUSTES MANUAIS (grade) ----------
  const ov = cd.overrides || {}
  taxes.forEach((t) => {
    if (t.manual) return // guias manuais são editadas via extraTaxes (por id), não por override de nome
    const o = ov[t.tax]
    if (!o) return
    if (o.value !== undefined && o.value !== "") t.value = fmtNum(parseBR(o.value))
    if (o.dueDate) t.dueDate = o.dueDate
  })

  // ---------- CONTA NA COMPETÊNCIA (carga efetiva + composição) ----------
  // Guias do motor contam por padrão; o usuário pode desligar por linha via
  // overrides[tax].conta. As manuais já vêm com o flag definido no push acima.
  taxes.forEach((t) => {
    if (t.manual) return
    const o = ov[t.tax]
    t.contaCompetencia = o?.conta !== undefined ? o.conta : true
  })

  // ---------- GUIAS DO MOTOR APAGADAS (overrides[tax].off) ----------
  // O usuário pode remover uma guia gerada pelo motor; ela some da lista e dos totais.
  // O botão "Recalcular" (que limpa os overrides) traz todas de volta.
  for (let i = taxes.length - 1; i >= 0; i--) {
    if (!taxes[i].manual && ov[taxes[i].tax]?.off) taxes.splice(i, 1)
  }

  // ---------- TOTAIS ----------
  // Total a recolher (caixa do mês): todas as guias, inclusive manuais
  // (parcelamentos, débitos de meses anteriores e taxas avulsas).
  const totApurado = taxes.reduce((s, t) => s + parseBR(t.apurado), 0)
  const totRetido = taxes.reduce((s, t) => s + parseBR(t.retido), 0)
  const totPagar = taxes.reduce((s, t) => s + parseBR(t.value), 0)
  // Impostos próprios da competência: só as guias marcadas como "conta na competência"
  // (guias do motor por padrão + manuais que o usuário incluiu). Parcelamentos e
  // pendências de meses anteriores ficam de fora — não inflam a alíquota efetiva.
  const ehTributoMes = (t: TaxRow) => !!t.contaCompetencia
  const totApuradoMes = taxes.filter(ehTributoMes).reduce((s, t) => s + parseBR(t.apurado), 0)
  const totPagarMes = taxes.filter(ehTributoMes).reduce((s, t) => s + parseBR(t.value), 0)
  // Alíquota efetiva passa a usar só os impostos da competência.
  const aliqEfetiva = revenue > 0 ? (totApuradoMes / revenue) * 100 : 0

  // ---------- ECONOMIAS ----------
  const economias: Economia[] = []
  // Economia do Fator R só existe para atividade sujeita ao Fator R (alterna III ↔ V).
  if (sn && sujeitoFatorR && sn.rbt12 > 0 && revenue > 0) {
    const rIII = calcSN(sn.rbt12, "Anexo III").rate
    const rV = calcSN(sn.rbt12, "Anexo V").rate
    const dasIII = (revenue * rIII) / 100
    const dasV = (revenue * rV) / 100
    const atingiu = sn.fatorR >= 28
    economias.push({
      tipo: "fatorr", titulo: "Fator R", positivo: atingiu,
      de: dasV, para: dasIII, valor: dasV - dasIII, atingiu, fatorR: sn.fatorR, deLabel: "Anexo V", paraLabel: "Anexo III",
      detalhe: atingiu
        ? `Com Fator R de ${sn.fatorR.toFixed(2).replace(".", ",")}% (≥ 28%), a empresa é tributada no Anexo III, com alíquota menor.`
        : `Fator R de ${sn.fatorR.toFixed(2).replace(".", ",")}% (< 28%): empresa no Anexo V. Aumentar folha/pró-labore pode reduzir o imposto.`,
    })
  }
  if (lp && lp.equip && (lp.equipRevenue || 0) > 0) {
    // Economia da equiparação medida SOBRE A RECEITA DE SERVIÇO (não o faturamento todo,
    // que no multiatividade incluiria o comércio): 32% padrão × 8%/12% equiparado.
    const rev = lp.equipRevenue || 0
    const irpjOf = (b: number) => b * (params.irpjRate / 100) + Math.max(0, b - params.irpjAdicLimiteMensal) * (params.irpjAdicRate / 100)
    const irpj32 = irpjOf(baseLP(rev, params.presIrpjServicos / 100, params))
    const csll32 = baseLP(rev, params.presCsllServicos / 100, params) * (params.csllRate / 100)
    const irpjEq = irpjOf(baseLP(rev, 0.08, params))
    const csllEq = baseLP(rev, 0.12, params) * (params.csllRate / 100)
    const economia = irpj32 + csll32 - (irpjEq + csllEq)
    economias.push({
      tipo: "hospitalar", titulo: "Equiparação Hospitalar", positivo: economia > 0,
      de: irpj32 + csll32, para: irpjEq + csllEq, valor: economia, deLabel: "Presunção 32%", paraLabel: "Presunção 8% / 12%",
      detalhe: "IRPJ e CSLL com presunção reduzida (8% e 12%) por serviço hospitalar/equiparado, em vez dos 32% padrão.",
    })
  }
  if (totRetido > 0) {
    economias.push({
      tipo: "retencao", titulo: "Retenções na Fonte", positivo: true,
      de: null, para: null, valor: totRetido,
      detalhe: "Parte dos tributos já foi retida e antecipada pelo tomador, reduzindo o desembolso no mês.",
    })
  }
  const economiaTributaria = economias.filter((e) => e.tipo !== "retencao" && e.valor > 0).reduce((s, e) => s + e.valor, 0)
  const economiaCaixa = economias.filter((e) => e.tipo === "retencao").reduce((s, e) => s + e.valor, 0)

  return { regime, atividade, revenue, atividades: apAtividades, taxes, sn, lp, mei, ret, totApurado, totRetido, totPagar, totApuradoMes, totPagarMes, aliqEfetiva, economias, economiaTributaria, economiaCaixa }
}

/* ===== Simulação Lucro Presumido (p/ a comparação de economia do relatório) ===== */
export interface SimLP {
  pis: number
  cofins: number
  irpj: number
  csll: number
  issIcms: number
  issIcmsLabel: string
  total: number
}
/** Estimativa do que a empresa pagaria no Lucro Presumido sobre a mesma receita.
 *  ICMS (comércio) não é estimado com precisão (varia por estado/ST) → 0. */
/** Economia do mês conforme o tipo de atividade:
 *  • Serviços  → comparação com o Lucro Presumido (Simples × Presumido).
 *  • Comércio/Indústria → economia gerada pela segregação (PIS/COFINS monofásico +
 *    ICMS-ST), medida como a redução do DAS frente ao DAS "cheio". Só há economia
 *    quando existe segregação (senão dasNominal ≈ das e o valor é ~0).
 *  • Demais regimes → economias do próprio motor (Fator R, equiparação, retenções). */
export function calcEconomia(ap: Apuracao, issRate = 5, params: ParametrosFiscais = PARAMETROS_PADRAO): { valor: number; tipo: "presumido" | "segregacao" | "outro"; sim: SimLP | null } {
  if (ap.sn) {
    if (ap.atividade === "Serviços") {
      const sim = simularLucroPresumido(ap.revenue, ap.atividade, issRate, params)
      return { valor: Math.max(0, sim.total - ap.sn.das), tipo: "presumido", sim }
    }
    return { valor: Math.max(0, ap.sn.dasNominal - ap.sn.das), tipo: "segregacao", sim: null }
  }
  return { valor: ap.economiaTributaria + ap.economiaCaixa, tipo: "outro", sim: null }
}

export function simularLucroPresumido(revenue: number, atividade: string, issRate = 5, params: ParametrosFiscais = PARAMETROS_PADRAO): SimLP {
  const serv = atividade !== "Comércio"
  const pis = revenue * (params.pisCumulativo / 100)
  const cofins = revenue * (params.cofinsCumulativo / 100)
  const baseIrpj = baseLP(revenue, (serv ? params.presIrpjServicos : params.presIrpjComercio) / 100, params)
  const irpj = baseIrpj * (params.irpjRate / 100) + Math.max(0, baseIrpj - params.irpjAdicLimiteMensal) * (params.irpjAdicRate / 100)
  const csll = baseLP(revenue, (serv ? params.presCsllServicos : params.presCsllComercio) / 100, params) * (params.csllRate / 100)
  const issIcms = serv ? revenue * (issRate / 100) : 0
  const total = pis + cofins + irpj + csll + issIcms
  return { pis, cofins, irpj, csll, issIcms, issIcmsLabel: serv ? "ISS" : "ICMS", total }
}

/* ===== Comparativo de carga total: Simples Nacional × Lucro Presumido =====
 * Reaproveita computeApuracao para cada regime (folha, CPP, RAT, Terceiros, FGTS
 * e pró-labore entram corretamente). Simula ambos sem os overrides manuais. */
export interface CompLinha { tributo: string; simples: number; presumido: number }
export interface Comparativo {
  linhas: CompLinha[]
  totalSimples: number
  totalPresumido: number
  economia: number
  melhor: "Simples Nacional" | "Lucro Presumido"
  atual: string
  simulavel: boolean
  /** true p/ comércio/indústria: o ICMS do lado Presumido é estimado (% efetivo). */
  estimado: boolean
  /** Base de cálculo da projeção do Lucro Presumido — transparência das exclusões:
   *  a revenda monofásica sai da base de PIS/COFINS e as vendas em ST saem da base de
   *  ICMS (já tributadas na origem). IRPJ/CSLL presumem sobre a receita bruta total. */
  baseCalc: {
    /** Receita bruta total (base de partida do PIS/COFINS). */
    receita: number
    /** Receita de comércio/indústria (base de partida do ICMS). */
    receitaComercio: number
    /** Revenda monofásica — excluída da base de PIS/COFINS. */
    recMonofasica: number
    /** Vendas em ICMS-ST — excluídas da base de ICMS. */
    recST: number
    /** Base líquida de PIS/COFINS (receita − monofásica). */
    basePisCofins: number
    /** Base líquida de ICMS (receita comércio − ST). */
    baseICMS: number
    /** Há base de ICMS/comércio (mostra a coluna do ICMS). */
    comercio: boolean
  }
}

const COMP_ORDEM = ["DAS", "PIS", "COFINS", "IRPJ", "Adicional IRPJ", "CSLL", "ISS", "ICMS", "CPP (Patronal)", "RAT", "Terceiros", "FGTS", "INSS (Pró-labore)"]
const COMP_EXCLUI = ["INSS (Folha)", "IRRF (Folha)"]

export function simularComparativo(cd: ClientData, ap: Apuracao, params: ParametrosFiscais = PARAMETROS_PADRAO): Comparativo {
  const atual = cd.regime
  const isSN = atual === "Simples Nacional"
  const isLP = atual === "Lucro Presumido" || atual === "Lucro Real"
  const base: ClientData = { ...cd, overrides: undefined }
  // Para empresa do Simples, a atividade do comparativo vem do ANEXO (fonte
  // autoritativa), não do campo que pode estar inconsistente: Anexo I→Comércio,
  // II→Indústria, III/IV/V→Serviços (estes pagam ISS no Lucro Presumido).
  const ativDoAnexo = (anexo?: string): ClientData["atividade"] =>
    anexo === "Anexo I" ? "Comércio" : anexo === "Anexo II" ? "Indústria" : "Serviços"
  const ativComparativo = isSN ? ativDoAnexo(cd.anexo) : cd.atividade
  const ehServico = ativComparativo === "Serviços"
  // ICMS do lado Lucro Presumido (comércio/indústria): usa o ICMS real digitado se a
  // empresa já é LP; senão ESTIMA pela ALÍQUOTA EFETIVA informada sobre as vendas
  // TRIBUTÁVEIS — a receita em ICMS-ST é excluída (já recolhida antes, sem débito próprio).
  const ativsCmp = cd.atividades || []
  const recComercio = ativsCmp.length
    ? ativsCmp.filter((a) => (a.tipo || ativDoAnexo(a.anexo)) !== "Serviços").reduce((s, a) => s + parseBR(a.receita), 0)
    : (ehServico ? 0 : ap.revenue)
  // Receita em ST e monofásica: por parcela quando há tabela por atividade; na atividade
  // ÚNICA, usa o total segregado guardado do PGDAS-D (segReceitaST/segReceitaMono) — assim
  // ICMS-ST e monofásico também são excluídos das bases sem precisar de tabela por atividade.
  const recST = ativsCmp.length
    ? ativsCmp.reduce((s, a) => s + (a.receitaST ? parseBR(a.receitaST) : (a.substituicaoICMS ? parseBR(a.receita) : 0)), 0)
    : Math.max(0, cd.segReceitaST || 0)
  const baseICMS = Math.max(0, recComercio - recST)
  // Receita monofásica (revenda PIS/COFINS zero) — mesma lógica por parcela usada em
  // computeApuracao, para o quadro de "base de cálculo" refletir EXATAMENTE a base que
  // a projeção do Lucro Presumido usa no PIS/COFINS.
  const recMonofasica = ativsCmp.length
    ? ativsCmp.reduce((s, a) => s + (a.receitaMonofasica ? parseBR(a.receitaMonofasica) : (a.monofasica ? parseBR(a.receita) : 0)), 0)
    : Math.max(0, cd.segReceitaMono || 0)
  const basePisCofins = Math.max(0, ap.revenue - recMonofasica)
  const icmsLP = isLP && parseBR(cd.icmsRecolher) > 0 ? parseBR(cd.icmsRecolher) : baseICMS * (parseBR(cd.icmsCompPct) / 100)
  const apS = isSN ? ap : computeApuracao({ ...base, regime: "Simples Nacional", anexo: cd.anexo || "Anexo III" }, params)
  const apP = isLP ? ap : computeApuracao({ ...base, regime: "Lucro Presumido", atividade: ativComparativo, icmsRecolher: fmtNum(icmsLP) }, params)

  const somaPorTributo = (a: Apuracao) => {
    const m: Record<string, number> = {}
    a.taxes.filter((t) => !t.manual && !COMP_EXCLUI.includes(t.tax)).forEach((t) => { m[t.tax] = (m[t.tax] || 0) + parseBR(t.value) })
    return m
  }
  const sMap = somaPorTributo(apS)
  const pMap = somaPorTributo(apP)
  const extras = Object.keys({ ...sMap, ...pMap }).filter((n) => !COMP_ORDEM.includes(n))
  const nomes = [...COMP_ORDEM.filter((n) => sMap[n] || pMap[n]), ...extras]
  const linhas: CompLinha[] = nomes.map((n) => ({ tributo: n, simples: sMap[n] || 0, presumido: pMap[n] || 0 }))
  const totalSimples = linhas.reduce((s, l) => s + l.simples, 0)
  const totalPresumido = linhas.reduce((s, l) => s + l.presumido, 0)
  // Serviços: comparativo 100% derivável (ISS conhecido). Comércio/indústria: só é
  // simulável quando há ICMS p/ o lado Presumido (real, se LP, ou estimado por %).
  const icmsOk = baseICMS <= 0 || (isLP ? parseBR(cd.icmsRecolher) > 0 : parseBR(cd.icmsCompPct) > 0)
  const dadosOk = isSN ? totalPresumido > 0 : parseBR(cd.rbt12) > 0 && totalSimples > 0
  const simulavel = icmsOk && dadosOk
  return {
    linhas, totalSimples, totalPresumido,
    economia: Math.abs(totalSimples - totalPresumido),
    melhor: totalSimples <= totalPresumido ? "Simples Nacional" : "Lucro Presumido",
    atual, simulavel, estimado: baseICMS > 0 && !(isLP && parseBR(cd.icmsRecolher) > 0),
    baseCalc: {
      receita: ap.revenue,
      receitaComercio: recComercio,
      recMonofasica,
      recST,
      basePisCofins,
      baseICMS,
      comercio: recComercio > 0.005,
    },
  }
}
