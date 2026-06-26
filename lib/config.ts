// Identidade do escritório exibida no relatório. Edite aqui para trocar contato/marca.
export const ESCRITORIO = {
  nome: "Gilberto Negreiros Contabilidade",
  marca: "GILBERTO NEGREIROS",
  submarca: "Contabilidade",
  email: "contato@gilbertonegreiros.com.br",
  telefone: "(00) 0000-0000",
}

export const TETO_SIMPLES = 4_800_000

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
