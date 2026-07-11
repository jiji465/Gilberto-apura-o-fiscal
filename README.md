# Gilberto Negreiros — Relatório Fiscal Mensal

Sistema web para gerar **relatórios fiscais mensais** dos clientes do escritório
(Simples Nacional — todos os anexos — e Lucro Presumido / Lucro Real / MEI).
App **client-only** (Next.js 15 + React 19 + Tailwind + TS): sem banco de dados,
sem cadastro e sem envio por e-mail — preenche a competência, gera e imprime o PDF.

## O que faz

Navegação: **Painel · Relatório Mensal · Configurações**.

- **Relatório Mensal** (`/relatorio`) — para cada competência:
  - **Importa o PGDAS-D** (Simples Nacional): anexe o PDF da Declaração/Extrato. O sistema
    identifica sozinho **faturamento, RBT12, RBA/RBAA, folha, Fator R, anexo** e a
    **repartição exata do DAS**, com **segregação de ICMS normal × ICMS-ST** e **PIS/COFINS
    monofásico** — inclusive **por atividade** e **por parcela** em declarações com várias
    atividades.
  - **Lucro Presumido / Real / MEI**: entrada manual (equiparação hospitalar 8%/12%,
    IRPJ/CSLL trimestral, retenções, ICMS, etc.).
  - **Múltiplas atividades** (Simples e LP): receita, anexo/tipo e segregação por atividade;
    o faturamento do mês é a soma das linhas.
  - **Impostos do mês × Total a recolher**: cada guia tem um controle **"conta na competência"**.
    A carga efetiva, o medidor, a composição e o parecer usam só os **impostos próprios do mês**;
    a agenda e o "total a recolher" incluem **parcelamentos** e **débitos de meses anteriores**.
  - **Parcelamentos** e **pendências** (débitos em aberto); uma pendência pode "emitir guia" e
    entrar no caixa do mês sem contar na carga.
  - Gera um **relatório A4** com: Carga Tributária, Comparativo de Regimes (serviços),
    Receita por Atividade (multi-atividade), Agenda Fiscal, Resumo/Indicadores com **parecer da
    competência**, Observações e Pendências. Paginação automática — nada é cortado.
  - **Baixar PDF** ou **Imprimir**.
- **Painel** (`/`) — porta de entrada com atalhos e o passo a passo do fluxo.
- **Configurações** (`/configuracoes`) — parâmetros fiscais (PIS/COFINS/ISS, presunções
  IRPJ/CSLL, adicional, **majoração LC 224/2025**). Único ajuste global salvo.

### Editor com preview ao vivo

- **Cockpit de KPIs** no topo (Faturamento · Impostos do mês · Alíquota efetiva · Total a recolher),
  atualizado enquanto se digita.
- **Split-view em telas largas (≥1024px)**: formulário à esquerda, **relatório A4 ao vivo** à
  direita (com debounce). Em telas estreitas, alterna por abas **Editar / Visualizar**.

## Rodar

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Build de produção: `pnpm build && pnpm start`. Verificação de tipos: `pnpm typecheck`
(não há framework de testes; a verificação é typecheck + checagem no navegador).

## Dados

Tudo roda no **navegador** — zero configuração. O `localStorage` guarda apenas:
- `gn:parametros` — os parâmetros fiscais (Configurações);
- `gn:draft` — o **rascunho** da competência em edição (autossalvo, para não se perder ao navegar).

Não há histórico nem cadastro: cada competência é efêmera (só o rascunho atual persiste).

## Estrutura

```
app/            páginas: painel (/), relatório (/relatorio), configurações (/configuracoes)
components/     Nav, Toaster, RelatorioMensal (as páginas A4 do relatório)
lib/            engine.ts (motor fiscal)  pgdas.ts (parser do PGDAS-D)  storage.ts (localStorage)
                format.ts  config.ts (marca/parâmetros do escritório)  pdf.ts (ler PGDAS / gerar PDF)
```

Para trocar nome/contato do escritório ou os parâmetros padrão, edite `lib/config.ts`.
