# Parcelamentos no relatório do cliente — Design

Data: 2026-06-25

## Contexto

O sistema gera um **relatório mensal em PDF enviado ao cliente** para que ele tenha
ciência da **apuração do mês** e veja um **calendário com o vencimento de cada imposto**.
A apuração (página "Carga Tributária") e o calendário de vencimentos (página "Agenda
Fiscal") **já existem**.

Falta incluir os **parcelamentos** (ex.: parcelamento de DAS/REFIS): a parcela do mês
precisa aparecer no calendário, na lista de vencimentos e no total a recolher — para o
cliente saber que, além dos impostos, há uma parcela a pagar e quando.

Decisão do usuário: a parcela é **lançada manualmente a cada mês** (sem cadastro fixo),
reaproveitando o editor "Outras guias e itens" já existente. **Não** há controle de
status nem obrigações acessórias.

## Escopo

**Inclui:** lançar a parcela do mês como um item do grupo "Parcelamento" e exibi-la, com
tratamento próprio, no calendário/vencimentos/total do relatório.

**Não inclui:** cadastro fixo de parcelamento por cliente; controle de status
(pago/enviado); obrigações acessórias; qualquer painel administrativo interno.

## Design

### 1. Modelo (`lib/types.ts`)
- `ExtraTax` ganha dois campos opcionais: `parcelaNum?: string` e `parcelaTot?: string`
  (ex.: "3" e "12").
- `TaxRow` ganha `parcela?: string` (ex.: "3 de 12"), preenchido pelo motor a partir dos
  campos acima quando o grupo é "Parcelamento".

### 2. Motor (`lib/engine.ts`)
- Em `computeApuracao`, ao mapear `extraTaxes` para `TaxRow`, quando `e.group ===
  "Parcelamento"` e houver `parcelaNum`, definir `row.parcela = "${parcelaNum} de
  ${parcelaTot || "?"}"`. Sem mudança nos totais (a parcela já entra como item normal:
  soma no total, aparece em vencimentos pela `dueDate`).

### 3. Editor (`app/relatorio/page.tsx`)
- Acrescentar **"Parcelamento"** à lista `ITEM_GRUPOS`.
- Na linha de item, quando `group === "Parcelamento"`, exibir dois campos compactos
  **"Nº parcela"** e **"de (total)"** no lugar do campo "Retido" (parcelamento não tem
  retenção). Demais grupos continuam mostrando "Retido".

### 4. Relatório (`components/RelatorioMensal.tsx`)
- `guiaTag`: grupo/descrição de parcelamento → etiqueta **"PARC"**.
- **Lista de vencimentos** (VencCell na pág. 1/3 e VRow na Agenda): item com `group ===
  "Parcelamento"` mostra o subtítulo **"Parcelamento"** e, se houver, **"· parcela 3 de
  12"**.
- **Calendário** (Agenda Fiscal): o dia da parcela é marcado como dia de pagamento, com a
  etiqueta "PARC" na célula (reaproveita o estilo `.cell.pay`; sem novo estilo
  obrigatório).
- **Total a recolher**: já inclui a parcela (item normal) — sem mudança.

## Componentes e responsabilidades

- `ExtraTax`/`TaxRow` (tipos): transportam os dados da parcela.
- `computeApuracao` (motor): deriva o rótulo "X de Y" e mantém a parcela no fluxo de
  taxes/vencimentos/total.
- Editor: captura a parcela do mês.
- `RelatorioMensal`: apresenta a parcela com etiqueta e rótulo próprios.

Cada peça é independente: o motor não conhece a UI; o relatório só lê `TaxRow`.

## Verificação

1. `pnpm typecheck` sem erros.
2. No navegador (`/relatorio`): importar/preencher uma competência, adicionar um item do
   grupo **Parcelamento** (ex.: "Parcelamento DAS", R$ 1.000, venc. 20/06, parcela 3 de
   12).
3. Conferir em **Visualizar**:
   - o item aparece na **lista de vencimentos** com etiqueta "Parcelamento · parcela 3 de
     12";
   - o dia 20 no **calendário** está marcado com "PARC";
   - o **Total a recolher** somou a parcela.
4. Gerar o **PDF** e confirmar que a parcela consta.

## Fora de escopo / futuro
- Cadastro recorrente de parcelamento (auto-incrementar a parcela a cada mês).
- Distinção visual de cor da célula do calendário para parcelas.
