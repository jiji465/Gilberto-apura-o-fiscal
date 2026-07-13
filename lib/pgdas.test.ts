// Testes-âncora do leitor do PGDAS-D. Cobrem a IDENTIFICAÇÃO que muda o cálculo:
// classificação de atividade/anexo (regressão silenciosa que o typecheck não pega),
// especialmente comércio com ICMS 100% em ST — que aparece zerado na repartição.
// Rodar: `pnpm test`.
import { describe, it, expect } from "vitest"
import { parsePGDAS } from "./pgdas"

// Extrato real (anonimizado no essencial) de distribuidora de bebidas: revenda de
// mercadorias com as duas parcelas em ICMS-ST e a maior também monofásica de PIS/COFINS.
// A repartição do DAS traz ICMS = 0,00 (débito próprio zerado pela ST).
const EXTRATO_BEBIDAS_ST = `Extrato do Simples Nacional
PGDAS-D 2018
1) Informações do Contribuinte
Nome Empresarial: DISTRIBUIDORA DE BEBIDAS FORTUNA LTDA
CNPJ Estabelecimento: 59.798.238/0001-57
2) Informações da Apuração
Período de Apuração (PA): 06/2026
Receita Bruta do PA (RPA) - Competência 44.114,00 0,00 44.114,00
(RBT12) 528.600,95 0,00 528.600,95
2.4) Fator r
Fator r = Não se aplica
Município: FORTUNA UF: MA
Valor do Débito por Tributo para a Atividade (R$):
Revenda de mercadorias, exceto para o exterior - Com substituição tributária/tributação
monofásica/antecipação com encerramento de tributação
Receita Bruta Informada: R$ 44.114,00
IRPJ CSLL COFINS PIS/Pasep INSS/CPP ICMS IPI ISS Total
166,88 106,19 9,87 2,14 1.274,35 0,00 0,00 0,00 1.559,43
Parcela 1: R$ 1.126,00
Substituição tributária de: ICMS.
Parcela 2: R$ 42.988,00
Substituição tributária de: ICMS.
Tributação monofásica de: COFINS, PIS.
4) Total Geral da Empresa
Total do Débito Declarado (exigível + suspenso) (R$)
IRPJ CSLL COFINS PIS/Pasep INSS/CPP ICMS IPI ISS Total
166,88 106,19 9,87 2,14 1.274,35 0,00 0,00 0,00 1.559,43`

describe("parsePGDAS — comércio com ICMS 100% em ST (distribuidora)", () => {
  const res = parsePGDAS(EXTRATO_BEBIDAS_ST)

  it("identifica os campos básicos", () => {
    expect(res).not.toBeNull()
    expect(res!.fields.clientName).toContain("DISTRIBUIDORA DE BEBIDAS FORTUNA")
    expect(res!.fields.compMonth).toBe("6")
    expect(res!.fields.compYear).toBe("2026")
    expect(res!.fields.revenue).toBe("44.114,00")
    expect(res!.fields.dasOfficial).toBe("1.559,43")
  })

  it("classifica como COMÉRCIO / Anexo I mesmo com ICMS zerado (tudo em ST)", () => {
    // Regressão do bug: antes caía no default Serviços/Anexo III porque a repartição
    // oficial traz ICMS 0,00 (débito próprio some na ST).
    expect(res!.fields.atividade).toBe("Comércio")
    expect(res!.fields.anexo).toBe("Anexo I")
  })

  it("a atividade também é inferida como Anexo I e marcada como ST + monofásica", () => {
    expect(res!.atividades).toHaveLength(1)
    const a = res!.atividades[0]
    expect(a.anexo).toBe("Anexo I")
    expect(a.substituicaoICMS).toBe(true)
    expect(a.monofasica).toBe(true)
    // Ambas as parcelas em ST (1.126 + 42.988) e só a 2ª monofásica (42.988).
    expect(a.receitaST).toBe("44.114,00")
    expect(a.receitaMonofasica).toBe("42.988,00")
  })

  it("segrega os TOTAIS de receita ST e monofásica (base do que não puxa p/ o LP)", () => {
    // Usados na atividade única p/ excluir ST/monofásico das bases de ICMS e PIS/COFINS.
    expect(res!.seg.receitaST).toBeCloseTo(44_114, 2)
    expect(res!.seg.receitaMonofasica).toBeCloseTo(42_988, 2)
  })
})

describe("parsePGDAS — serviços não regride", () => {
  // Extrato mínimo de serviço (ISS > 0) deve continuar Serviços / Anexo III.
  const EXTRATO_SERVICO = `Extrato do Simples Nacional
Nome Empresarial: CLINICA EXEMPLO LTDA
Período de Apuração (PA): 06/2026
Receita Bruta do PA (RPA) - Competência 20.000,00 0,00 20.000,00
(RBT12) 200.000,00 0,00 200.000,00
Fator r = Não se aplica
4) Total Geral da Empresa
IRPJ CSLL COFINS PIS/Pasep INSS/CPP ICMS IPI ISS Total
400,00 300,00 200,00 100,00 500,00 0,00 0,00 500,00 2.000,00`

  it("mantém Serviços / Anexo III quando há ISS", () => {
    const res = parsePGDAS(EXTRATO_SERVICO)
    expect(res).not.toBeNull()
    expect(res!.fields.atividade).toBe("Serviços")
    expect(res!.fields.anexo).toBe("Anexo III")
  })
})
