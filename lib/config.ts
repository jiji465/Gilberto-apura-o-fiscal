// Identidade do escritório exibida no relatório. Edite aqui para trocar contato/marca.
export const ESCRITORIO = {
  nome: "Gilberto Negreiros Contabilidade",
  marca: "GILBERTO NEGREIROS",
  submarca: "Contabilidade",
  email: "gnsjrcont@outlook.com",
  telefone: "(99) 98412-3064",
}

export const TETO_SIMPLES = 4_800_000

/* ===== DIFAL do Simples Nacional — Maranhão (Lei 8.948/2009, red. Lei 10.956/2018) =====
 * Antecipação do diferencial de alíquota nas AQUISIÇÕES INTERESTADUAIS de empresas do
 * Simples: percentual aplicado sobre o VALOR DAS COMPRAS, pela faixa de receita bruta dos
 * 12 meses anteriores (RBT12). [limiteRBT12, percentual]. Até 120k isento; acima de 3,6M
 * usa a diferença de alíquota cheia (não-optante, §5º art. 13 LC 123/2006). */
export const DIFAL_MA_SN: [number, number][] = [
  [120_000, 0],
  [240_000, 1.10],
  [360_000, 2.30],
  [480_000, 2.50],
  [600_000, 2.58],
  [720_000, 2.82],
  [840_000, 2.84],
  [960_000, 2.87],
  [1_080_000, 3.07],
  [1_200_000, 3.10],
  [1_320_000, 3.38],
  [1_440_000, 3.41],
  [1_560_000, 3.45],
  [1_680_000, 3.48],
  [1_800_000, 3.51],
  [1_920_000, 3.82],
  [2_040_000, 3.85],
  [2_160_000, 3.88],
  [2_280_000, 3.91],
  [2_520_000, 3.95],
  [3_000_000, 4.10],
  [3_600_000, 4.30],
]
/** Percentual do DIFAL (MA/Simples) pela RBT12. Retorna 0 = isento (≤ 120k ou sem RBT12)
 *  e null = acima de 3,6M (diferença de alíquota cheia — informar manualmente). */
export function difalMASNPercent(rbt12: number): number | null {
  if (rbt12 <= 0) return 0
  if (rbt12 > 3_600_000) return null
  for (const [limite, pct] of DIFAL_MA_SN) if (rbt12 <= limite) return pct
  return null
}

// Parâmetros fiscais editáveis (Configurações). Percentuais como inteiros (32 = 32%).
// Defaults = alíquotas vigentes em 2026.
export interface ParametrosFiscais {
  pisCumulativo: number
  cofinsCumulativo: number
  presIrpjServicos: number
  presIrpjComercio: number
  presCsllServicos: number
  presCsllComercio: number
  /** ISS padrão (serviços) — varia por município; pode ser ajustado por competência. */
  issPadrao: number
  irpjRate: number
  irpjAdicRate: number
  irpjAdicLimiteMensal: number
  csllRate: number
  /** LC 224/2025: majoração da presunção na parcela de receita acima do limite anual. */
  majoracaoAtiva: boolean
  majoracaoPct: number
  majoracaoLimiteAnual: number
}

export const PARAMETROS_PADRAO: ParametrosFiscais = {
  pisCumulativo: 0.65,
  cofinsCumulativo: 3,
  presIrpjServicos: 32,
  presIrpjComercio: 8,
  presCsllServicos: 32,
  presCsllComercio: 12,
  issPadrao: 5,
  irpjRate: 15,
  irpjAdicRate: 10,
  irpjAdicLimiteMensal: 20000,
  csllRate: 9,
  majoracaoAtiva: true,
  majoracaoPct: 10,
  majoracaoLimiteAnual: 5_000_000,
}
