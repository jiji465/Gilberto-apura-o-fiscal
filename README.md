# Gilberto Negreiros — Relatório Fiscal Mensal

Sistema web para gerar e enviar **relatórios fiscais mensais** aos clientes do escritório
(Simples Nacional — todos os anexos — e Lucro Presumido / Lucro Real / MEI).

## O que faz

- **Clientes** — cadastro das empresas (CNPJ com busca automática na BrasilAPI, regime, anexo, atividade, e-mail).
- **Relatório Mensal** — para cada cliente/competência:
  - **Importa o PGDAS-D** (Simples Nacional): basta anexar o PDF da Declaração/Extrato. O sistema identifica sozinho **faturamento, RBT12, folha, Fator R, anexo** e a **repartição exata do DAS**, com **segregação de ICMS normal × ICMS-ST** e **PIS/COFINS monofásico** (inclusive em declarações com várias atividades).
  - **Lucro Presumido / Real / MEI**: entrada manual dos dados do mês (com equiparação hospitalar, retenções etc.).
  - Gera um **relatório de 6 páginas A4** (Carga Tributária, Agenda Fiscal, Faturamento Líquido, Evolução 12 meses, Economia Tributária, Indicadores Fiscais).
  - **Baixar PDF**, **Imprimir** ou **Enviar ao cliente** por e-mail.
- **Painel** — visão geral (nº de clientes, competências apuradas, economia acumulada, apurações recentes).
- **Histórico** — cada competência salva alimenta os gráficos de evolução e a economia acumulada no ano.

## Rodar

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Build de produção: `pnpm build && pnpm start`. Verificação de tipos: `pnpm typecheck`.

## Dados

Os dados (clientes e competências) ficam no **navegador** (`localStorage`) — zero configuração,
ideal para uso em um computador. Para multiusuário/backup, a camada `lib/storage.ts` pode ser
trocada por um banco (ex.: Supabase) sem alterar as telas.

## Estrutura

```
app/            páginas (painel, clientes, relatório) + api/send-report
components/     Nav, Toaster, RelatorioMensal (as 6 páginas)
lib/            engine.ts (motor fiscal)  pgdas.ts (parser)  storage.ts
                format.ts  config.ts (marca do escritório)  pdf.ts (ler PGDAS / gerar PDF)
```

Para trocar o nome/contato do escritório, edite `lib/config.ts`.
