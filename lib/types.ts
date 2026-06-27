// Tipos do domínio: clientes, dados da apuração e resultado calculado.

export type Regime = "Simples Nacional" | "Lucro Presumido" | "Lucro Real" | "MEI"
export type Atividade = "Serviços" | "Comércio" | "Indústria"
export type Anexo = "Anexo I" | "Anexo II" | "Anexo III" | "Anexo IV" | "Anexo V"

/** Cliente cadastrado. */
export interface Cliente {
  id: string
  nome: string
  cnpj?: string
  email?: string
  telefone?: string
  regime: Regime
  atividade: Atividade
  anexo?: Anexo
  municipio?: string
  uf?: string
  ativo: boolean
  criadoEm: string
}

/** Estado do editor de uma competência (monetários em string "pt-BR"). */
export interface ClientData {
  clienteId?: string
  clientName?: string
  cnpj?: string
  compMonth?: string // "1".."12"
  compYear?: string // "2026"
  competenceShort?: string // "05/2026"
  regime: Regime
  atividade: Atividade
  anexo?: Anexo
  /** Anexo III: marca que a atividade é sujeita ao Fator R (cai p/ Anexo V se < 28%).
   *  Anexo V já é sempre sujeito (sobe p/ III se ≥ 28%), independente deste flag. */
  sujeitoFatorR?: boolean
  // MEI
  meiCategoria?: string
  meiDasFixo?: string
  // mês
  revenue?: string
  rbt12?: string
  /** Lucro Presumido: receita acumulada do TRIMESTRE (base do IRPJ/CSLL trimestral).
   *  Vazio ⇒ usa receita do mês × 3 como estimativa. */
  receitaTrimestre?: string
  folha12m?: string
  folhaMensal?: string
  proLabore?: string
  /** Nº de dependentes para o cálculo do IRRF sobre o pró-labore. */
  proLaboreDeps?: string
  issRate?: string
  ratRate?: string
  terceirosRate?: string
  /** INSS retido dos empregados (GPS) — valor digitado (tabela progressiva). */
  inssRetidoFolha?: string
  /** IRRF retido da folha (DARF) — valor digitado. */
  irrfFolha?: string
  /** ICMS a recolher (Lucro Presumido comércio/indústria) — valor digitado. */
  icmsRecolher?: string
  equipHospitalar?: boolean
  ret?: Record<string, string>
  extraTaxes?: ExtraTax[]
  repartManual?: Record<string, string>
  /** Ajustes manuais por tributo (grade "Impostos a recolher"): valor e/ou vencimento. */
  overrides?: Record<string, { value?: string; dueDate?: string }>
  dasOfficial?: string
  // segregação lida do PGDAS-D (comércio: economia por monofásico/ST)
  segIcmsST?: number
  segIcmsNormal?: number
  segPisCofinsMono?: number
  // opcionais do relatório
  numNotas?: string
  observacoes?: string
  /** Débitos em aberto (informativos — NÃO entram no total a recolher do mês). */
  pendencias?: Pendencia[]
}

/** Débito em aberto da empresa (atraso, cobrança, dívida ativa). Informativo. */
export interface Pendencia {
  id?: string
  descricao: string
  valor?: string
  /** Competência do débito (MM/AAAA) — período a que se refere, não a data de vencimento. */
  competencia?: string
  /** Situação livre: "vencido", "em cobrança", "dívida ativa", "parcelar", etc. */
  situacao?: string
}

export interface ExtraTax {
  id?: string
  tax: string
  base?: string
  rate?: string
  value?: string
  retido?: string
  dueDate?: string
  obs?: string
  group?: string
  /** Parcelamento: número da parcela e total (ex.: "3" e "12"). */
  parcelaNum?: string
  parcelaTot?: string
}

export interface TaxRow {
  tax: string
  base: string
  rate: string
  apurado: string
  retido: string
  value: string
  dueDate: string
  obs: string
  group: string
  manual?: boolean
  /** Preenchido nas linhas manuais com o id do extraTax (p/ a grade gravar de volta). */
  id?: string
  /** Preenchido pelo motor p/ itens de Parcelamento: "3 de 12". */
  parcela?: string
}

export interface RepartItem {
  tax: string
  pct: number
  value: number
}

export interface SnInfo {
  rbt12: number
  folha12: number
  fatorR: number
  anexoBase: string
  anexoEf: string
  rate: number
  nominal: number
  deducao: number
  faixa: number
  das: number
  /** DAS "cheio" (alíquota × receita, sem segregação ST/monofásico) — base da economia no comércio. */
  dasNominal: number
  repart: RepartItem[]
}

export interface MeiInfo {
  das: number
  categoria: string
  repart: RepartItem[]
  limiteAnual: number
}

export interface LpInfo {
  equip: boolean
  pIrpj: number
  pCsll: number
  baseIrpj: number
  baseCsll: number
  irpj: number
  adic: number
  csll: number
  issRate: number
}

export interface Economia {
  tipo: "fatorr" | "hospitalar" | "retencao" | "regime"
  titulo: string
  positivo: boolean
  de: number | null
  para: number | null
  valor: number
  deLabel?: string
  paraLabel?: string
  detalhe: string
  atingiu?: boolean
  fatorR?: number
}

export interface Apuracao {
  regime: Regime
  atividade: Atividade
  revenue: number
  taxes: TaxRow[]
  sn: SnInfo | null
  lp: LpInfo | null
  mei: MeiInfo | null
  ret: Record<string, string>
  totApurado: number
  totRetido: number
  totPagar: number
  aliqEfetiva: number
  economias: Economia[]
  economiaTributaria: number
  economiaCaixa: number
}

/** Ponto do histórico mensal (gráfico de evolução). */
export interface HistPoint {
  key: string // "AAAA-MM"
  competenceShort?: string
  faturamento: number
  tributos: number
  totPagar: number
  aliquota: number
  economia: number
}

/** Registro persistido de uma competência apurada. */
export interface ApuracaoRecord {
  clienteId: string
  compKey: string // "AAAA-MM"
  competenceShort: string
  regime: Regime
  anexo?: string
  atividade: Atividade
  faturamento: number
  rbt12: number
  totalPagar: number
  aliquotaEfetiva: number
  economia: number
  das: number
  payload: ClientData
  updatedAt: string
}
