# Apuração completa por regime (folha e pró-labore) — Design

Data: 2026-06-25

## Contexto

Hoje o motor (`lib/engine.ts`) apura o tributo da receita (DAS no Simples; PIS/COFINS/
ISS/IRPJ/CSLL no Lucro Presumido) e parte dos encargos de folha, mas:
- não gera **FGTS** no Simples;
- junta **folha + pró-labore** na base de **RAT** (incorreto — RAT/FGTS/Terceiros incidem
  **só na folha de empregados**, nunca no pró-labore);
- não tem campos para **INSS retido dos empregados**, **IRRF da folha** e **ICMS** (LP).

O objetivo é deixar a apuração **completa e correta por regime**, gerando as guias certas
**condicionalmente** (folha só se houver folha; pró-labore só se houver pró-labore).

## Incidências (verificadas)

**Pró-labore** *(gera só se pró-labore > 0)*
- INSS 11% (retido do sócio) — todos os regimes.
- INSS patronal 20% — Lucro Presumido/Real e Simples **Anexo IV** (demais anexos: embutido no DAS).
- Sem FGTS, sem RAT, sem Terceiros.

**Folha de empregados** *(gera só se folha > 0)*
- FGTS 8% — todos.
- CPP patronal 20% — LP/Real e Anexo IV (demais anexos: no DAS).
- RAT (1–3%, ajustável) — LP/Real e Anexo IV.
- Terceiros (~5,8%, ajustável) — só LP/Real (Simples é isento, inclusive Anexo IV).
- INSS retido dos empregados e IRRF — **valores digitados** (tabelas progressivas).

**Receita (sempre)** — Simples: DAS. LP: PIS, COFINS, ISS, IRPJ, CSLL. + **ICMS digitado**
(LP comércio/indústria).

## Design

### 1. Campos (`lib/types.ts` → `ClientData`)
Novos (strings pt-BR, opcionais): `inssRetidoFolha`, `irrfFolha`, `icmsRecolher`.
Já existentes e reutilizados: `folhaMensal`, `proLabore`, `ratRate`, `terceirosRate`.

### 2. Motor (`lib/engine.ts`)
Centralizar os encargos de folha/pró-labore numa seção única (não-MEI), **substituindo** a
lógica de folha hoje duplicada no bloco do Anexo IV e no bloco do Lucro Presumido. Regras:

- `patronalAplica = (regime LP/Real) || (Simples && anexoEf === "Anexo IV")`.
- **Folha** (`folhaMensal > 0`):
  - FGTS = 8% × folha (todos).
  - se `patronalAplica`: CPP 20% × (folha + pró-labore); RAT `ratRate`% × folha.
  - se LP/Real: Terceiros `terceirosRate`% × folha.
- **Pró-labore** (`proLabore > 0`):
  - INSS 11% × pró-labore (todos).
  - (a parte patronal do pró-labore já entra na base do CPP acima, quando `patronalAplica`).
- **Digitados** (não-MEI): se `inssRetidoFolha > 0` → guia "INSS (Folha)"; se `irrfFolha > 0`
  → guia "IRRF (Folha)"; se LP && comércio/indústria && `icmsRecolher > 0` → guia "ICMS".
- Vencimentos: FGTS dia 7; CPP/RAT/Terceiros/INSS/IRRF/ICMS dia 20 (já no mapa de
  `dueDate`; acrescentar "INSS (Folha)" e "IRRF (Folha)" ao mapa, ambos dia 20).

Importante: a base do CPP patronal soma folha + pró-labore (uma única GPS patronal), mas
RAT/FGTS/Terceiros usam **somente a folha**. INSS 11% usa **somente o pró-labore**.

### 3. Formulário (`app/relatorio/page.tsx`, card "Dados do mês")
- **Folha de salários do mês (R$)** (`folhaMensal`) passa a aparecer para **todos os
  não-MEI** (hoje só Anexo IV/LP).
- Novos campos (não-MEI): **INSS retido dos empregados (R$)** (`inssRetidoFolha`) e **IRRF
  retido da folha (R$)** (`irrfFolha`).
- **ICMS a recolher (R$)** (`icmsRecolher`) para **LP comércio/indústria**.
- `proLabore` (já existe) continua para não-MEI.

### 4. Relatório (`components/RelatorioMensal.tsx`)
Sem mudança estrutural: as novas guias já fluem por `ap.taxes` para composição,
vencimentos (calendário/lista) e total — pelos campos `group`/`dueDate`/`value` existentes.

## Verificação
1. `pnpm typecheck` sem erros.
2. Navegador (`/relatorio`):
   - **Simples não-IV, com folha 10.000 + pró-labore 5.000 + INSS retido 800 + IRRF 200:**
     guias = DAS, FGTS (800), INSS pró-labore (550), INSS (Folha) 800, IRRF (Folha) 200.
     **Sem** CPP/RAT/Terceiros (estão no DAS). Total e calendário batendo.
   - **Anexo IV, mesma folha/pró-labore:** acrescenta CPP 20% × 15.000 = 3.000 e RAT × 10.000.
     **Sem** Terceiros.
   - **Lucro Presumido serviços, folha 10.000 + pró-labore 5.000 + ICMS 0:** PIS, COFINS,
     ISS, IRPJ, CSLL, FGTS, CPP 3.000, RAT, Terceiros, INSS pró-labore 550.
   - **Sem folha e sem pró-labore:** nenhuma guia de folha/pró-labore é gerada.
3. Conferir que RAT/FGTS **não** incidem sobre o pró-labore (base correta).

## Fora de escopo
- Cálculo automático de INSS retido/IRRF por funcionário (tabelas progressivas) — fora;
  são valores digitados.
- ICMS automático por estado/ST — fora; é valor digitado.
