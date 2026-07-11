# PROGRESSO — Gilberto Negreiros · Relatório Fiscal Mensal

> Handoff de contexto (atualizado 2026-07-11). App Next.js 15 + React 19 + Tailwind 3 + TS em `C:\Users\Admin\Downloads\GILBERTO`.
> Rodar: `pnpm dev` (preview "gn" na porta **3212**; `next dev` padrão 3000). Verificação = `pnpm typecheck` + checagem no navegador. **Sem framework de testes.**
> **Git:** repositório em `github.com/jiji465/Gilberto-apura-o-fiscal`, branch `main`.

## O que é o sistema (estado atual)
Ferramenta de **uso mensal, SEM banco de dados e SEM cadastro**: preenche os dados da competência → gera/imprime o PDF do relatório. **Nada de cliente/competência é salvo como histórico.** O `localStorage` guarda só: **parâmetros fiscais** (`gn:parametros`) e o **rascunho** da competência em edição (`gn:draft`, autossalvo).

Navegação (`components/Nav.tsx`): **Painel · Relatório Mensal · Configurações**.
- `app/page.tsx` — Painel: atalhos + "como funciona". Sem stats.
- `app/relatorio/page.tsx` — gerador (split-view em ≥lg; abas Editar/Visualizar no mobile).
- `app/configuracoes/page.tsx` — parâmetros de alíquotas (salvos em `gn:parametros`).
- **Removidos (há tempo):** `/clientes`, cadastro/seleção, histórico/competências salvas, gráfico de evolução, e o **envio por e-mail** (`app/api/send-report` deletado). Não há rota de API.

## Arquitetura / arquivos-chave
- `lib/engine.ts` — motor: Simples (Anexos I–V, Fator R III↔V@28%), Lucro Presumido/Real, MEI, folha/pró-labore, retenções, **majoração LC 224/2025** (`baseLP`), **IRRF 2026** (`calcIRRF2026`). `computeApuracao(cd, params)`. Suporta **múltiplas atividades** (`atividades[]`→`ApuracaoAtividade[]`), **segregação por parcela** (monofásico/ICMS-ST), e o split **competência × caixa** (`totApuradoMes`/`totPagarMes` × `totPagar`). `simularComparativo`/`simularLucroPresumido` (projeção LP a partir do PGDAS-D, ciente da segregação). `calcEconomia` (legado).
- `lib/pgdas.ts` — parser do PGDAS-D: **multi-atividade** (uma linha por atividade, com anexo inferido), repartição oficial ("Total Geral da Empresa"), **segregação por parcela** de ICMS-ST e PIS/COFINS monofásico, RBT12/RBA/RBAA, Fator R declarado, `atividadeCurta()` p/ rótulo enxuto, warnings.
- `lib/config.ts` — `ESCRITORIO` (contato `gnsjrcont@outlook.com` · `(99) 98412-3064`), `TETO_SIMPLES` (4,8mi), `TETO_INSS_2026` (8475.55), `MEI_*`, `interface ParametrosFiscais` + `PARAMETROS_PADRAO`.
- `lib/storage.ts` — `uid()`, `getParametros()`/`saveParametros()` (`gn:parametros`) e `getDraft()`/`saveDraft()`/`clearDraft()` (`gn:draft`).
- `lib/types.ts` — `ClientData` (inclui `atividades[]`, `overrides.{conta,off}`, `pendencias`), `AtividadeLinha`, `TaxRow` (inclui `contaCompetencia`), `ApuracaoAtividade`, `Apuracao` (inclui `totApuradoMes`/`totPagarMes`/`atividades`), `Pendencia` (inclui `emitiuGuia`/`contaCompetencia`), `ExtraTax` (inclui `contaCompetencia`).
- `lib/pdf.ts` — `exportRelatorioPDF` (html2canvas+jsPDF, captura `.sheet`), `lerTextoPGDAS`.
- `components/RelatorioMensal.tsx` — o relatório (CSS escopado em `.gn-doc`, string `STYLE`).
- `components/Nav.tsx`, `components/Toaster.tsx`.

## Conceito: impostos do mês × total a recolher
- **Impostos da competência** (`totApuradoMes`/`totPagarMes`): guias com `contaCompetencia === true`. Base da **carga efetiva, medidor, composição (rosca), KPI "Impostos" e parecer**.
- **Total a recolher** (`totPagar`): tudo que vence no mês, incluindo **parcelamentos** e **débitos de meses anteriores** (`contaCompetencia === false`). Base da **agenda** e da linha "Total a recolher".
- Cada linha da grade tem um **toggle "conta na competência"**; guias do motor nascem `true`, parcelamentos `false`. Pendências com `emitiuGuia` entram no caixa (padrão fora da carga).

## Relatório (`RelatorioMensal.tsx`) — estrutura de páginas
Páginas A4 fixas (`.page` = `210×297mm`, `overflow:hidden`). Ordem (condicionais aparecem só quando fazem sentido):
1. **Carga Tributária** — clientbar, medidor (gauge), composição (donut, legenda capada em 8 via `capSegs`), cockpit de KPIs, painel de economia (Fator R / monofásico+ST / equiparação).
2. **Comparativo de Regimes** (só serviços, se `comp.simulavel`) — herói + barras + tabela; SplitBar da base (exclusão monofásico/ST).
3. **Receita por Atividade** (só se >1 atividade) — tabela por atividade (receita, anexo/tipo, DAS/presunção) + barras de segregação por atividade.
4. **Agenda Fiscal** — calendário + vencimentos em **grade compacta 3 colunas**; continuações paginam automaticamente.
5. **Resumo / Indicadores** — anéis/indicadores + **parecer da competência** condicional (regime, Fator R, teto do Simples, guias vencidas, pró-labore, retenções, parcelamentos, pendências).
6. **Observações** — página(s) dedicada(s), paginadas (`chunkObs`).
7. **Pendências** (se houver) — débitos em aberto (informativo, fora dos totais).
- **Competência sem movimento**: se `revenue=0` e sem guias, sai uma página única declarando ausência de movimento (CGSN 140/2018).

## Editor (`app/relatorio/page.tsx`)
- **Split-view** (`useIsWide`, ≥1024px): editor à esquerda + **preview A4 ao vivo** à direita (escala via `.rep-scaler { zoom }`; **reset em print e export** p/ o PDF sair em A4 cheio; preview com **debounce 250ms**). Abaixo de lg: abas Editar/Visualizar.
- **Cockpit** de KPIs no topo (instantâneo): Faturamento · Impostos do mês · Alíquota efetiva · Total a recolher.
- **Seções (accordion):** 1 Empresa & Competência · 2 Regime & Enquadramento (com análise de Fator R ao vivo) · 3 Faturamento (com subseção **Atividades** multi-linha) · 4 Folha & Pró-labore · 5 Impostos & Observações · 6 Parcelamentos & Pendências.
- **Grade "Impostos a recolher":** guias do motor (editáveis via `overrides` por nome, com toggle **conta** e **apagar** `off`) + manuais (`extraTaxes` por `id`). "Recalcular" restaura o motor.
- **Importar PGDAS-D** (SN): preenche empresa, competência, atividades, RBT12, folha, Fator R, repartição e segregação. **Projeção Lucro Presumido** ao vivo (Simples × LP × mais econômico), ciente da segregação.
- **Colar do Excel** em parcelamentos e pendências. **Autossalva** o rascunho a cada mudança.

## Regras fiscais já implementadas
- **Tabelas SN (Anexos I–V) e repartição por faixa** (LC 123 / Res. CGSN 140).
- **Vencimentos:** só DAS/DAS-MEI **prorrogam**; demais **antecipam** (MP 2.158-35/2001). FGTS dia 20. Salário mínimo 2026 = R$ 1.621.
- **INSS pró-labore:** 11% limitado ao teto R$ 8.475,55. **IRRF pró-labore (auto, 2026):** `calcIRRF2026` (isento até 5k; redutor parcial até 7.350).
- **Comparativo / projeção Simples × Lucro Presumido = carga TOTAL** (folha/CPP/RAT/Terceiros/FGTS/pró-labore), reaproveitando `computeApuracao`. Serviços 100% derivável; comércio/indústria dependem do ICMS efetivo informado.
- **Segregação por parcela** (monofásico/ICMS-ST) exclui a receita correspondente da base de PIS/COFINS/ICMS na projeção do LP.
- **Parâmetros editáveis** (Configurações): PIS/COFINS/ISS, presunções IRPJ/CSLL, adicional/limite, majoração LC 224/2025.

## PENDENTE / próximos passos
- **Feriados nacionais** no `adjustWeekend` (`lib/engine.ts`): hoje só trata sábado/domingo. Vencimento em feriado sai na data errada. Precisa de calendário (fixos + móveis via Páscoa). **Único item fiscal em aberto.**
- (Opcional) INSS de **empregados** (folha) é digitado; poderia auto-calcular pela tabela progressiva.
- (Opcional) `debounce`/escala do preview e coesão visual já aplicados; ajustar janela (250ms) / zoom (0.62) se necessário.

## Docs internas
- Specs/planos em `docs/superpowers/specs/` e `docs/superpowers/plans/`.
- Agente de design: `🎨 report-designer` (Professor Synapse).

## Como verificar rápido
1. `cd /c/Users/Admin/Downloads/GILBERTO && pnpm typecheck` → sem erros.
2. Preview "gn" 3212 → `/relatorio`. Em ≥1024px, split-view (editor + preview). Medir overflow via `preview_eval` (`#rep-overlay`, `.page`/`.main` scrollHeight vs clientHeight). O screenshot esteve instável em sessões recentes — preferir **medição do DOM**.
