// Testes-âncora do motor fiscal. Cobrem o que dá regressão silenciosa de NÚMERO
// (que o typecheck nunca pega): faixas do Simples, Fator R no limiar de 28%, IRRF
// 2026 na isenção/redutor, vencimentos (antecipa × prorroga, trimestral) e uma
// apuração ponta-a-ponta já validada no app. Rodar: `pnpm test`.
import { describe, it, expect } from "vitest"
import { calcSN, calcFatorR, anexoEfetivo, calcIRRF2026, dueDate, computeApuracao, feriadosNacionais } from "./engine"
import { difalMASNPercent } from "./config"
import { parseBR } from "./format"
import type { ClientData } from "./types"

describe("calcSN — alíquota efetiva por anexo/faixa", () => {
  it("1ª faixa Anexo III = 6% nominal (dedução 0)", () => {
    const r = calcSN(72_000, "Anexo III")
    expect(r.faixa).toBe(1)
    expect(r.rate).toBeCloseTo(6, 5)
  })
  it("1ª faixa Anexo V = 15,5%", () => {
    expect(calcSN(72_000, "Anexo V").rate).toBeCloseTo(15.5, 5)
  })
  it("faixa com parcela a deduzir (Anexo III, RBT12 1MM → 4ª faixa)", () => {
    const r = calcSN(1_000_000, "Anexo III")
    expect(r.faixa).toBe(4)
    // (1.000.000×16% − 35.640) / 1.000.000 = 12,436%
    expect(r.rate).toBeCloseTo(12.436, 3)
  })
  it("RBT12 zero → tudo zero (sem faixa)", () => {
    expect(calcSN(0, "Anexo III")).toEqual({ rate: 0, nominal: 0, deducao: 0, faixa: 0 })
  })
})

describe("Fator R — decide Anexo III ↔ V no limiar de 28%", () => {
  it("folha 22k / RBT12 72k = 30,56%", () => {
    expect(calcFatorR(22_000, 72_000)).toBeCloseTo(30.56, 1)
  })
  it("sujeito ao Fator R: ≥28% → III, <28% → V", () => {
    expect(anexoEfetivo("Anexo III", 30.5, true)).toBe("Anexo III")
    expect(anexoEfetivo("Anexo III", 27.99, true)).toBe("Anexo V")
    expect(anexoEfetivo("Anexo III", 28, true)).toBe("Anexo III")
  })
  it("NÃO sujeito ao Fator R: mantém o anexo escolhido", () => {
    expect(anexoEfetivo("Anexo III", 10, false)).toBe("Anexo III")
  })
})

describe("calcIRRF2026 — isenção e redutor", () => {
  it("rendimento até 5.000 é isento", () => {
    expect(calcIRRF2026(3_800, 418, 0)).toBe(0)
    expect(calcIRRF2026(5_000, 550, 0)).toBe(0)
  })
  it("faixa de redutor parcial (6.000) = 392,75", () => {
    expect(calcIRRF2026(6_000, 660, 0)).toBeCloseTo(392.75, 2)
  })
  it("rendimento cresce ⇒ imposto cresce", () => {
    expect(calcIRRF2026(9_000, 990, 0)).toBeGreaterThan(calcIRRF2026(6_000, 660, 0))
  })
})

describe("dueDate — antecipa × prorroga e apuração trimestral", () => {
  // Competência 05/2026: dia 20 do mês seguinte (20/06/2026) cai num SÁBADO.
  it("DAS PRORROGA para o próximo dia útil (segunda 22/06)", () => {
    expect(dueDate("5", "2026", "DAS")).toBe("22/06/2026")
  })
  it("INSS (Pró-labore) ANTECIPA para o dia útil anterior (sexta 19/06)", () => {
    expect(dueDate("5", "2026", "INSS (Pró-labore)")).toBe("19/06/2026")
  })
  it("IRPJ é trimestral: vence no último dia útil do mês seguinte ao trimestre", () => {
    // 05/2026 → trimestre encerra 30/06 → vence 31/07/2026 (sexta)
    expect(dueDate("5", "2026", "IRPJ")).toBe("31/07/2026")
  })
})

describe("feriadosNacionais — fixos e móveis por Páscoa (2026, Páscoa 05/04)", () => {
  const f = feriadosNacionais(2026)
  it("fixos: Consciência Negra (20/11) e Natal (25/12)", () => {
    expect(f.has("11-20")).toBe(true)
    expect(f.has("12-25")).toBe(true)
  })
  it("móveis: Sexta Santa (03/04), Carnaval (16-17/02) e Corpus Christi (04/06)", () => {
    expect(f.has("04-03")).toBe(true)
    expect(f.has("02-16")).toBe(true)
    expect(f.has("02-17")).toBe(true)
    expect(f.has("06-04")).toBe(true)
  })
})

describe("dueDate — desloca em feriado nacional (o furo que estava aberto)", () => {
  // Competência 10/2026: DAS vence 20/11 (Consciência Negra), que em 2026 é uma SEXTA.
  it("DAS PRORROGA do feriado (20/11 sex) + fim de semana para segunda 23/11", () => {
    expect(dueDate("10", "2026", "DAS")).toBe("23/11/2026")
  })
  it("INSS (Pró-labore) ANTECIPA o feriado para quinta 19/11", () => {
    expect(dueDate("10", "2026", "INSS (Pró-labore)")).toBe("19/11/2026")
  })
})

describe("difalMASNPercent — tabela DIFAL Simples/MA por RBT12 (Lei 8.948/2009)", () => {
  it("isento até 120k (e sem RBT12)", () => {
    expect(difalMASNPercent(0)).toBe(0)
    expect(difalMASNPercent(120_000)).toBe(0)
  })
  it("faixas: 120k→1,10%; 240k→1,10%; 240.000,01→2,30%; 3,6M→4,30%", () => {
    expect(difalMASNPercent(120_000.01)).toBe(1.10)
    expect(difalMASNPercent(240_000)).toBe(1.10)
    expect(difalMASNPercent(240_000.01)).toBe(2.30)
    expect(difalMASNPercent(3_600_000)).toBe(4.30)
  })
  it("acima de 3,6M → null (diferença de alíquota cheia, manual)", () => {
    expect(difalMASNPercent(3_600_000.01)).toBeNull()
    expect(difalMASNPercent(4_000_000)).toBeNull()
  })
})

describe("computeApuracao — DIFAL de compras interestaduais (Simples comércio/MA)", () => {
  const base: ClientData = {
    regime: "Simples Nacional",
    atividade: "Comércio",
    anexo: "Anexo I",
    compMonth: "5",
    compYear: "2026",
    revenue: "50.000,00",
    rbt12: "300.000,00", // faixa 240k–360k → 2,30%
    comprasInterestaduais: "20.000,00",
    ret: {},
    extraTaxes: [],
  }
  it("guia ICMS DIFAL = compras × % da faixa (20.000 × 2,30% = 460)", () => {
    const d = computeApuracao(base).taxes.find((t) => t.tax === "ICMS DIFAL")
    expect(d).toBeTruthy()
    expect(parseBR(d!.value)).toBeCloseTo(460, 2)
  })
  it("DIFAL conta na competência e soma na alíquota efetiva", () => {
    const ap = computeApuracao(base)
    const d = ap.taxes.find((t) => t.tax === "ICMS DIFAL")!
    expect(d.contaCompetencia).toBe(true)
    const semDifal = computeApuracao({ ...base, comprasInterestaduais: "" })
    expect(ap.totPagarMes - semDifal.totPagarMes).toBeCloseTo(460, 2)
  })
  it("serviço puro do Simples NÃO gera DIFAL", () => {
    const serv = computeApuracao({ ...base, atividade: "Serviços", anexo: "Anexo III" })
    expect(serv.taxes.some((t) => t.tax === "ICMS DIFAL")).toBe(false)
  })
  it("empresa mista (serviço + linha de comércio) gera DIFAL", () => {
    const mista = computeApuracao({
      ...base, atividade: "Serviços", anexo: "Anexo III", comprasInterestaduais: "10.000,00",
      atividades: [{ id: "a1", descricao: "Comércio", receita: "50.000,00", anexo: "Anexo I" }],
    })
    expect(mista.taxes.some((t) => t.tax === "ICMS DIFAL")).toBe(true)
  })
})

describe("computeApuracao — caso-âncora (Simples serviços, Fator R atingido)", () => {
  const base: ClientData = {
    regime: "Simples Nacional",
    atividade: "Serviços",
    anexo: "Anexo III",
    sujeitoFatorR: true,
    compMonth: "5",
    compYear: "2026",
    revenue: "15.200,00",
    rbt12: "72.000,00",
    folha12m: "22.000,00",
    proLabore: "3.800,00",
    ret: {},
    extraTaxes: [],
  }

  it("DAS = 6% do faturamento = 912,00", () => {
    const ap = computeApuracao(base)
    expect(ap.sn!.das).toBeCloseTo(912, 2)
    expect(ap.sn!.anexoEf).toBe("Anexo III")
  })
  it("impostos do mês = DAS + INSS pró-labore (418) = 1.330; sem IRRF pró (isento)", () => {
    const ap = computeApuracao(base)
    expect(ap.totPagarMes).toBeCloseTo(1_330, 2)
    const inss = ap.taxes.find((t) => t.tax === "INSS (Pró-labore)")
    expect(inss).toBeTruthy()
    expect(ap.taxes.some((t) => t.tax === "IRRF (Pró-labore)")).toBe(false)
  })
  it("alíquota efetiva = 1.330 / 15.200 = 8,75%", () => {
    expect(computeApuracao(base).aliqEfetiva).toBeCloseTo(8.75, 2)
  })
  it("parcelamento entra no total a recolher, mas NÃO na competência", () => {
    const comParc = computeApuracao({
      ...base,
      extraTaxes: [{ id: "p1", tax: "Refis DAS", value: "500,00", group: "Parcelamento" }],
    })
    expect(comParc.totPagar).toBeCloseTo(1_830, 2) // 1.330 + 500
    expect(comParc.totPagarMes).toBeCloseTo(1_330, 2) // inalterado
    expect(comParc.aliqEfetiva).toBeCloseTo(8.75, 2) // inalterado
  })
})
