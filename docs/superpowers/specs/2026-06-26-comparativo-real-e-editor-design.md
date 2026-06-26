# Comparativo real + editor por grade — Design

**Data:** 2026-06-26
**Objetivo:** (1) Tornar o comparativo Simples × Lucro Presumido REAL, considerando folha de pagamento e pró-labore nos dois regimes; (2) apresentá-lo claro no relatório (tabela lado a lado, tributo por tributo); (3) reorganizar a aba Editar em campos intuitivos, com uma grade editável de "Impostos a recolher" (valor + vencimento por linha).

## Parte 1 — Comparativo real (motor)

**`simularComparativo(cd, params): Comparativo`** em `lib/engine.ts`.

Estratégia: **reaproveitar `computeApuracao`** para cada regime (garante folha/CPP/RAT/Terceiros/FGTS/pró-labore corretos, incluindo Anexo IV). Simula AMBOS os regimes sem os overrides manuais (lei pura), mantendo `dasOfficial` para o lado Simples:

```
base = { ...cd, overrides: undefined }
apS = cd.regime === "Simples Nacional" ? apAtual : computeApuracao({ ...base, regime: "Simples Nacional", anexo: cd.anexo || "Anexo III" }, params)
apP = (cd.regime === "Lucro Presumido" || "Lucro Real") ? apAtual : computeApuracao({ ...base, regime: "Lucro Presumido" }, params)
```

Linhas comparáveis: somar `value` por nome de tributo, **excluindo** `manual` e retenções de empregados (`INSS (Folha)`, `IRRF (Folha)`). Ordem fixa: DAS · PIS · COFINS · IRPJ · Adicional IRPJ · CSLL · ISS · ICMS · CPP (Patronal) · RAT · Terceiros · FGTS · INSS (Pró-labore) · (demais).

```typescript
interface CompLinha { tributo: string; simples: number; presumido: number }
interface Comparativo {
  linhas: CompLinha[]
  totalSimples: number
  totalPresumido: number
  economia: number              // |totalSimples - totalPresumido|
  melhor: "Simples Nacional" | "Lucro Presumido"
  atual: Regime
  simulavel: boolean            // false se faltar dado p/ simular o outro regime (ex.: LP sem RBT12/anexo)
}
```

- Resultado: folha/pró-labore alto eleva o lado Presumido (CPP 20% + RAT + Terceiros por fora), refletindo a vantagem real do Simples. FGTS e INSS pró-labore aparecem iguais nos dois lados (carga honesta; não alteram a diferença).
- A economia por segregação (ICMS-ST/monofásico) fica naturalmente embutida, pois o lado Simples usa o DAS real (com `dasOfficial`).
- `calcEconomia` deixa de ser usada pelo relatório (substituída por `simularComparativo`); manter a função exportada por compatibilidade, mas o `RelatorioMensal` passa a usar o comparativo.

## Parte 2 — Tabela comparativa (relatório)

Em `components/RelatorioMensal.tsx`, substituir as barras (`CmpRow`) por uma **tabela**:

- Cabeçalho: Tributo · Simples Nacional · Lucro Presumido.
- Uma linha por `CompLinha` (formata `fmtBRL`; zera com "—").
- Rodapé: **Total** de cada regime (negrito) e uma faixa destacando **"Economia no <regime melhor>: R$ X/mês"**.
- Quando `!simulavel` (ex.: LP sem RBT12/anexo), exibir aviso curto em vez da tabela ("Informe RBT12 e anexo para comparar com o Simples.").
- O KPI/painel/anel de "Economia" passam a usar `comparativo.economia` e o rótulo "vs. <outro regime>".

## Parte 3 — Editor por grade (`app/relatorio/page.tsx`)

Aba Editar reorganizada em blocos enxutos, **sem parágrafos explicativos**:

1. **Identificação:** Nome · CNPJ · Mês · Ano · Regime · Atividade · Anexo (SN).
2. **Importar PGDAS-D** (SN): botão "Anexar PDF" + colar texto + "Preencher". Sem o texto longo (uma linha curta de ajuda só).
3. **MEI** (MEI): categoria + DAS fixo.
4. **Dados para cálculo** (grade compacta, adapta ao regime): Faturamento · RBT12 (SN) · Folha 12m (SN) · Folha do mês · Pró-labore · ISS% · RAT% · Terceiros% · INSS retido · IRRF · ICMS (LP comércio) · nº notas. Rótulos curtos.
5. **Impostos a recolher** (grade editável — a peça central):
   - Colunas: **Tributo · Valor · Vencimento** (+ remover, só em linhas manuais).
   - Origem: `ap.taxes` (calculadas + manuais juntas).
   - Linha **calculada** (`!manual`): tributo fixo; **Valor** e **Vencimento** editáveis → gravam em `cd.overrides[tributo]`.
   - Linha **manual** (`manual`): tributo, valor, vencimento editáveis e removível → gravam no `extraTax` correspondente (via `id`).
   - "+ Adicionar guia" (= `addItem`).
   - Botão **"Recalcular"** limpa `cd.overrides` (volta aos valores do motor).
6. **Observações.**

Remove o card "Repartição do DAS & ajustes" (o PGDAS preenche por trás; ajuste fino agora é na grade).

### Overrides no motor

- `ClientData.overrides?: Record<string, { value?: string; dueDate?: string }>` (chave = nome do tributo).
- `TaxRow.id?: string` — preenchido com o `id` do `extraTax` nas linhas manuais (para a grade gravar de volta).
- Em `computeApuracao`:
  - DAS do Simples: `dasOff = parseBR(cd.overrides?.["DAS"]?.value || cd.dasOfficial)` — assim o override do DAS **reescala** a repartição/composição.
  - Após montar todas as `taxes` (e extras), antes dos totais, aplicar override genérico: para cada `t`, se `overrides[t.tax]` → `t.value = fmtNum(parseBR(o.value))` (se houver) e `t.dueDate = o.dueDate` (se houver). Totais recalculados sobre `value`.
  - Limpar `overrides` automaticamente quando muda `regime`/`atividade`/`anexo` (em `upd`), além do botão Recalcular.

## Tratamento de erros / bordas

- Sem faturamento → grade só com guias manuais (se houver); comparativo vazio/—.
- LP sem RBT12/anexo → `simulavel:false`, tabela vira aviso.
- Override com valor vazio → ignora (usa o calculado).
- Remover linha calculada não é permitido (zere o valor); remover só manuais.

## Verificação

`pnpm typecheck` + navegador (preview "gn" 3212):
1. SN serviços com folha 40k + pró-labore 10k → tabela mostra Presumido com CPP 20%/RAT/Terceiros, total maior; economia coerente.
2. LP com RBT12+anexo → simula Simples (DAS), tabela lado a lado.
3. Editar: alterar o Valor e o Vencimento de uma linha calculada → reflete no total e na Agenda; "Recalcular" reverte. Adicionar/remover guia manual.
4. DAS editado reescala a composição (donut).

## Arquivos

- **Modificados:** `lib/engine.ts` (simularComparativo, overrides, DAS), `lib/types.ts` (`overrides`, `TaxRow.id`), `components/RelatorioMensal.tsx` (tabela comparativa + economia), `app/relatorio/page.tsx` (editor por blocos + grade).
