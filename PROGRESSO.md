# PROGRESSO — Gilberto Negreiros · Relatório Fiscal Mensal

> Handoff de contexto (2026-06-26). App Next.js 15 + React 19 + Tailwind 3 + TS em `C:\Users\Admin\Downloads\GILBERTO`.
> Rodar: `pnpm dev` (preview "gn" na porta **3212**). Verificação = `pnpm typecheck` + checagem no navegador. **Sem framework de testes. Sem git.**

## O que é o sistema (estado atual)
Ferramenta de **uso mensal, SEM banco de dados e SEM cadastro**: preenche os dados da competência → gera/imprime o PDF do relatório. **Nada de cliente/competência é salvo.** O ÚNICO dado persistido em `localStorage` são os **parâmetros fiscais** (`gn:parametros`).

Navegação (`components/Nav.tsx`): **Painel · Relatório Mensal · Configurações**.
- `app/page.tsx` — Painel: atalhos (Gerar relatório, Configurações) + "como funciona". Sem stats.
- `app/relatorio/page.tsx` — gerador (abas Editar/Visualizar).
- `app/configuracoes/page.tsx` — parâmetros de alíquotas (único dado salvo).
- **Removidos:** `/clientes`, cadastro/seleção de empresas, histórico/competências salvas, gráfico de evolução, e o **envio por e-mail** (`app/api/send-report` e `getRelatorioPdfBase64` deletados).

## Arquitetura / arquivos-chave
- `lib/engine.ts` — motor: Simples (Anexos I–V, Fator R III↔V@28%), Lucro Presumido/Real, MEI, folha/pró-labore, retenções, **majoração LC 224/2025** (`baseLP`), **IRRF 2026** (`calcIRRF2026`), `computeApuracao(cd, params)`, `simularComparativo(cd, ap, params)`, `calcEconomia` (legado, não usado no relatório).
- `lib/pgdas.ts` — parser do PGDAS-D (usa "Total Geral da Empresa"; segrega ICMS-ST e PIS/COFINS monofásico; warnings).
- `lib/config.ts` — `ESCRITORIO`, `TETO_SIMPLES`, `TETO_INSS_2026` (8475.55), `interface ParametrosFiscais` + `PARAMETROS_PADRAO`.
- `lib/storage.ts` — só `uid()` + `getParametros()`/`saveParametros()`.
- `lib/types.ts` — `ClientData` (inclui `overrides`, `proLaboreDeps`), `TaxRow` (inclui `id`, `parcela`), `Apuracao`, etc.
- `lib/pdf.ts` — `exportRelatorioPDF` (html2canvas+jsPDF, captura `.sheet`), `lerTextoPGDAS`.
- `components/RelatorioMensal.tsx` — o relatório (CSS escopado em `.gn-doc`, string `STYLE`).
- `components/Nav.tsx`, `components/Toaster.tsx`.

## Relatório (`RelatorioMensal.tsx`) — estrutura de páginas
Páginas A4 fixas (`.page` = `210×297mm`, `overflow:hidden`). Ordem:
1. **Carga Tributária** — clientbar, medidor (gauge), composição (donut, legenda capada em 8 via `capSegs`), KPIs do mês, painel de economia (só se houver economia real).
2. **Comparativo de Regimes** (só se `comp.simulavel`) — faixa-herói + barras + tabela `CompTable`.
3. **Agenda Fiscal** — calendário em cima + lista de vencimentos embaixo; **continuações** paginam (`FIRST` + `CONT=14/página`).
4. **Indicadores Fiscais** — anéis + **Detalhamento em cards** (`.dcards`/`MetricCard`).
5. **Observações** — página(s) dedicada(s), paginadas (`chunkObs`).
Numeração via `showComp/pgComp/pgAgenda/pgCont/pgIndic/pgObs`.

## Regras fiscais já implementadas e verificadas
- **Tabelas SN (Anexos I–V) e repartição por faixa** conferidas (LC 123 / Res. CGSN 140).
- **Vencimentos:** só DAS/DAS-MEI **prorrogam**; demais (PIS, COFINS, IRRF, INSS, CPP, RAT, Terceiros, FGTS, ICMS, ISS) **antecipam** (MP 2.158-35/2001). **FGTS dia 20**. Salário mínimo 2026 = R$ 1.621.
- **INSS pró-labore:** 11% limitado ao teto R$ 8.475,55 (máx R$ 932,31).
- **IRRF pró-labore (auto, 2026):** `calcIRRF2026` — isento até R$ 5.000; redutor parcial até R$ 7.350 (`978,62 − 0,133145×rend`); tabela 7,5/15/22,5/27,5%; dependente R$ 189,59; desconto simplificado R$ 607,20. Guia "IRRF (Pró-labore)". Campo `proLaboreDeps`.
- **Comparativo Simples × Lucro Presumido = carga TOTAL** (inclui folha/CPP 20%/RAT/Terceiros/FGTS/pró-labore), reaproveitando `computeApuracao` para cada regime. **Só para SERVIÇOS** (atividade derivada do ANEXO: I→Comércio, II→Indústria, III/IV/V→Serviços). Comércio/indústria não mostram comparativo (ICMS varia por estado/ST).
- **Parâmetros editáveis** (Configurações): PIS/COFINS/ISS, presunções IRPJ/CSLL (serviços/comércio), IRPJ/CSLL/adicional/limite, majoração LC 224/2025.

## Editor (`app/relatorio/page.tsx`)
- Campos: Nome/CNPJ (editáveis), Mês/Ano/Regime/Atividade/Anexo, importação PGDAS-D (SN), dados do mês (faturamento, RBT12, folha 12m, folha mês, pró-labore, **Dependentes IRRF**, ISS%, RAT%, Terceiros%, INSS retido, IRRF, ICMS, nº notas), Observações.
- **Atividade↔Anexo sincronizados** (só Simples) no `upd`.
- **Grade "Impostos a recolher":** lista as calculadas (`ap.taxes`, editáveis via `cd.overrides` por nome) + manuais (`cd.extraTaxes`, por `id`). Colunas Tributo · Valor (`Money`, aceita colar) · Vencimento (`DateBR`, texto DD/MM/AAAA, aceita colar). Botões "Recalcular" (limpa overrides) e "Adicionar guia".

## Performance / PDF
- `.page` com `content-visibility:auto` (não pinta páginas fora da tela); desativado em `.exporting`/`@media print`.
- `html2canvas` `scale:2`, JPEG 0.9, try/catch por página, libera canvas, `await setTimeout(0)` entre páginas.
- **Fidelidade:** texto em gradiente (wordmark, nº economia) some no html2canvas → classe `.exporting` troca para cor sólida na captura/print (gradiente fica só na tela). Fonte mínima 8px.
- **Robustez confirmada:** 26 guias → 6 páginas, zero overflow. NÃO quebra layout com muitos impostos.

## PENDENTE / próximos passos
- **Feriados nacionais** no `adjustWeekend` (`lib/engine.ts`): hoje só trata sábado/domingo. Vencimento em feriado sai na data errada. Precisa de calendário (fixos + móveis via Páscoa: Sexta Santa, Carnaval, Corpus Christi). **Único item fiscal em aberto.**
- (Opcional) INSS de **empregados** (folha) é digitado (`inssRetidoFolha`/`irrfFolha`); poderia auto-calcular pela tabela progressiva 7,5/9/12/14% + IRRF — não pedido ainda.

## Docs internas
- Specs/planos em `docs/superpowers/specs/` e `docs/superpowers/plans/` (parcelamentos, praticidade-clientes [revertido], parâmetros-fiscais, comparativo-real-e-editor).
- Plano de robustez: `C:\Users\Admin\.claude\plans\merry-singing-cake.md`.
- Agente de design criado: `🎨 report-designer` (Professor Synapse).

## Como verificar rápido
1. `cd /c/Users/Admin/Downloads/GILBERTO && pnpm typecheck` → sem erros.
2. Preview "gn" 3212 → `/relatorio`, aba Editar, preencher; aba Visualizar; medir overflow via `preview_eval` (`document.getElementById('rep-overlay')`, `.page`, `.stack` scrollHeight vs clientHeight). Screenshot do preview esteve instável em sessões recentes — preferir medição do DOM.
