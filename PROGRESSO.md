# PROGRESSO — Gilberto Negreiros · Relatório Fiscal Mensal

> Handoff de contexto (atualizado 2026-07-11). App Next.js 15 + React 19 + Tailwind 3 + TS em `C:\Users\Admin\Downloads\GILBERTO`.
> Rodar: `pnpm dev` (preview "gn" na porta **3212**; `next dev` padrão 3000).
> Verificação: `pnpm typecheck` + **`pnpm test`** (vitest) + checagem no navegador. Um **hook de pré-push** (`.githooks/pre-push`, ativado por `prepare`/`core.hooksPath`) roda typecheck + testes antes de todo push.
> **Git:** repositório em `github.com/jiji465/Gilberto-apura-o-fiscal`, branch `main`.

## O que é o sistema (estado atual)
Ferramenta de **uso mensal, SEM banco de dados e SEM cadastro**: preenche os dados da competência → gera/imprime o PDF do relatório. **Nada de cliente/competência é salvo como histórico.** O `localStorage` guarda só: **parâmetros fiscais** (`gn:parametros`) e o **rascunho** da competência em edição (`gn:draft`, autossalvo). Há **exportar/importar a competência em JSON** (backup / reabrir mês) no editor.

Navegação (`components/Nav.tsx`): **Painel · Relatório Mensal · Configurações**.
- `app/page.tsx` — Painel: atalhos + "como funciona". Sem stats.
- `app/relatorio/page.tsx` — gerador (split-view em ≥lg; abas Editar/Visualizar no mobile).
- `app/configuracoes/page.tsx` — parâmetros de alíquotas (salvos em `gn:parametros`).
- **Removidos (há tempo):** `/clientes`, cadastro/seleção, histórico, envio por e-mail. Não há rota de API.

## Arquitetura / arquivos-chave
- `lib/engine.ts` — motor: Simples (Anexos I–V, Fator R III↔V@28%), Lucro Presumido/Real, MEI, folha/pró-labore, retenções, majoração LC 224/2025, IRRF 2026. `computeApuracao(cd, params)`. **Múltiplas atividades**, **segregação por parcela** (monofásico/ICMS-ST), split **competência × caixa** (`totApuradoMes`/`totPagarMes` × `totPagar`). **Vencimentos com feriados nacionais** (`feriadosNacionais(ano)` — fixos + móveis por Páscoa; `adjustWeekend` faz laço). **DIFAL do Simples/MA** (compras interestaduais). `simularComparativo`/`simularLucroPresumido`.
- `lib/engine.test.ts` — **testes-âncora (vitest)**: faixas do Simples, Fator R@28%, IRRF 2026, vencimentos (antecipa×prorroga, trimestral, feriado), tabela DIFAL/MA e apurações ponta-a-ponta.
- `lib/pgdas.ts` — parser do PGDAS-D: multi-atividade, repartição oficial, segregação por parcela, RBT12/RBA/RBAA, Fator R, `atividadeCurta()`, warnings.
- `lib/config.ts` — `ESCRITORIO`, `TETO_SIMPLES`, `TETO_INSS_2026`, `MEI_*`, `ParametrosFiscais`/`PARAMETROS_PADRAO`, e **`DIFAL_MA_SN` + `difalMASNPercent(rbt12)`** (tabela da Lei 8.948/2009).
- `lib/storage.ts` — `getParametros`/`saveParametros` (`gn:parametros`) e `getDraft`/`saveDraft`/`clearDraft` (`gn:draft`).
- `lib/types.ts` — `ClientData` (inclui `atividades[]`, `overrides.{conta,off}`, `pendencias`, **`comprasInterestaduais`**), `TaxRow` (`contaCompetencia`), `Apuracao` (`totApuradoMes`/`totPagarMes`/`atividades`), etc.
- `lib/pdf.ts` — `exportRelatorioPDF` (**html2canvas-pro + jsPDF**, escala 2, **PNG** — raster nítido, sem texto selecionável). Para PDF vetorial/selecionável, usar **"Imprimir / PDF"** (`window.print` + `@media print @page`).
- `components/RelatorioMensal.tsx` — o relatório (CSS escopado em `.gn-doc`, string `STYLE`).

## Conceito: impostos do mês × total a recolher
- **Impostos da competência** (`totApuradoMes`/`totPagarMes`): guias com `contaCompetencia === true`. Base da carga efetiva, medidor, composição (rosca), KPI "Impostos" e parecer.
- **Total a recolher** (`totPagar`): tudo que vence no mês, incluindo parcelamentos e débitos de meses anteriores. Base da agenda.
- Cada linha da grade tem toggle **"Conta?"** (na competência). Guias do motor nascem `true`, parcelamentos `false`.

## DIFAL do Simples — Maranhão (compras interestaduais)
- Lei 8.948/2009 (red. Lei 10.956/2018): **percentual por faixa de RBT12 × valor das compras interestaduais** (tabela em `lib/config.ts`). ≤ 120k isento; > 3,6M usa a diferença cheia (manual).
- Campo **"Compras interestaduais no mês (R$)"** no editor (Simples comércio/indústria e **mista**). Gera a guia **"ICMS DIFAL"** (grupo ICMS), que **conta na competência** (soma na alíquota efetiva) e aparece no comparativo **só no lado Simples** (o Lucro Presumido não paga esse DIFAL).

## Relatório (`RelatorioMensal.tsx`) — estrutura de páginas
Páginas A4 fixas (`.page` = `210×297mm`, `overflow:hidden`). Todos os valores monetários com **centavos** (`fmtBRL`/`fmtNum`); layout **à prova de corte** (números `nowrap` + `line-height` folgado; nomes longos truncam com "…"). Ordem (condicionais só quando fazem sentido):
1. **Carga Tributária** — clientbar, medidor, composição (donut), cockpit de KPIs, painel de economia, lista "Guias a recolher no mês" (cap 6/14 → excedente na Agenda).
2. **Comparativo de Regimes** (se `comp.simulavel`) — herói + barras "Total de impostos por regime" + tabela tributo a tributo.
3. **Receita por Atividade** (se >1 atividade) — barra 100% empilhada + lista por atividade.
4. **Agenda Fiscal** — calendário + vencimentos em grade compacta 3 colunas; continuações paginam.
5. **Resumo / Indicadores** — parecer da competência condicional.
6. **Observações** · 7. **Pendências** (se houver).
- **Competência sem movimento**: página única declarando ausência de movimento.

## Editor (`app/relatorio/page.tsx`)
- **Split-view** (`useIsWide`, ≥1024px): editor + preview A4 ao vivo (escala `.rep-scaler { zoom }`, reset em print/export; debounce 250ms). Mobile: abas.
- **Cockpit** de KPIs no topo. **Exportar/Importar** competência (JSON).
- **Seções (accordion):** 1 Empresa & Competência · 2 Regime & Enquadramento · 3 Faturamento (com **Atividades** e **Compras interestaduais/DIFAL**) · 4 Folha & Pró-labore · 5 **Impostos a recolher** (grade + retenções + ICMS a recolher) · 6 Parcelamentos & Pendências · 7 **Observações**.
- Campos condicionais reorganizados p/ **não deixar buraco** ao trocar de regime; rótulos ISS/ICMS coerentes (real × comparativo).

## Regras fiscais implementadas
- Tabelas SN (Anexos I–V) e repartição por faixa (LC 123 / CGSN 140).
- **Vencimentos:** DAS/DAS-MEI **prorrogam**, demais **antecipam** (MP 2.158-35/2001); **feriados nacionais** (fixos + Sexta Santa, Carnaval, Corpus Christi) tratados.
- INSS pró-labore 11% (teto R$ 8.475,55); IRRF pró-labore 2026 (`calcIRRF2026`).
- Comparativo Simples × Lucro Presumido = carga TOTAL; segregação por parcela exclui a base do LP.
- **DIFAL Simples/MA** (compras interestaduais, por RBT12).

## PENDENTE / próximos passos
- (Opcional) INSS de **empregados** (folha) é digitado; poderia auto-calcular pela tabela progressiva.
- (Opcional) DIFAL acima de R$ 3,6 mi de RBT12 é informado manualmente (diferença cheia).
- (Futuro) **TypeScript 7** (nativo) só quando o Next.js suportar oficialmente / TS 7.1 (API estável, ~out/2026).

## Como verificar rápido
1. `pnpm typecheck` e `pnpm test` → sem erros (o pré-push roda os dois).
2. Preview "gn" 3212 → `/relatorio`. Em ≥1024px, split-view. Medir overflow via `preview_eval` (`#rep-overlay`, `.page`/`.main` scrollHeight vs clientHeight). Screenshot instável — preferir **medição do DOM**.

## Docs internas
- Specs/planos em `docs/superpowers/`.
- Agentes (Professor Synapse): `🎨 report-designer`, `🧾 tributario-brasil`, `🔄 processo-software-produto`.
