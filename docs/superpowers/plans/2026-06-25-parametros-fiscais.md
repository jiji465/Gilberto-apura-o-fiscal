# Parâmetros fiscais configuráveis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps usam checkbox `- [ ]`.

**Goal:** Página `/configuracoes` onde o usuário edita as alíquotas usadas na comparação Simples × Lucro Presumido e na apuração real do LP, persistidas em localStorage e aplicadas em todo o sistema; incluir a majoração da LC 224/2025.

**Architecture:** `ParametrosFiscais` + `PARAMETROS_PADRAO` (config) → `getParametros/saveParametros` (storage) → motor lê params (default = padrão, retrocompatível) → página de config edita → gerador carrega e passa ao cálculo e ao relatório.

**Global Constraints:** Sem testes/git — verificação = `pnpm typecheck` + navegador (preview "gn" 3212). Percentuais como inteiros (32 = 32%). Defaults = alíquotas atuais 2026.

---

## Task 1: `ParametrosFiscais` + `PARAMETROS_PADRAO` (lib/config.ts)

- [ ] Adicionar ao final de `lib/config.ts`:

```typescript
export interface ParametrosFiscais {
  pisCumulativo: number; cofinsCumulativo: number
  presIrpjServicos: number; presIrpjComercio: number
  presCsllServicos: number; presCsllComercio: number
  irpjRate: number; irpjAdicRate: number; irpjAdicLimiteMensal: number; csllRate: number
  majoracaoAtiva: boolean; majoracaoPct: number; majoracaoLimiteAnual: number
}
export const PARAMETROS_PADRAO: ParametrosFiscais = {
  pisCumulativo: 0.65, cofinsCumulativo: 3,
  presIrpjServicos: 32, presIrpjComercio: 8,
  presCsllServicos: 32, presCsllComercio: 12,
  irpjRate: 15, irpjAdicRate: 10, irpjAdicLimiteMensal: 20000, csllRate: 9,
  majoracaoAtiva: true, majoracaoPct: 10, majoracaoLimiteAnual: 5_000_000,
}
```
- [ ] `pnpm typecheck` → sem erros.

## Task 2: persistência (lib/storage.ts)

- [ ] Importar `ParametrosFiscais, PARAMETROS_PADRAO` de `./config`; adicionar `const K_PARAMS = "gn:parametros"` e:

```typescript
export function getParametros(): ParametrosFiscais {
  if (typeof window === "undefined") return PARAMETROS_PADRAO
  try { return { ...PARAMETROS_PADRAO, ...JSON.parse(window.localStorage.getItem(K_PARAMS) || "{}") } }
  catch { return PARAMETROS_PADRAO }
}
export function saveParametros(p: ParametrosFiscais) {
  if (typeof window === "undefined") return
  try { window.localStorage.setItem(K_PARAMS, JSON.stringify(p)) } catch { /* quota */ }
}
```
- [ ] `pnpm typecheck`.

## Task 3: motor lê parâmetros + majoração (lib/engine.ts)

- [ ] Importar `PARAMETROS_PADRAO` e tipo `ParametrosFiscais` de `./config`.
- [ ] Adicionar helper de base com majoração:

```typescript
function baseLP(revenue: number, presFrac: number, p: ParametrosFiscais): number {
  if (!p.majoracaoAtiva || p.majoracaoLimiteAnual <= 0) return revenue * presFrac
  const lim = p.majoracaoLimiteAnual / 12
  return Math.min(revenue, lim) * presFrac + Math.max(0, revenue - lim) * presFrac * (1 + p.majoracaoPct / 100)
}
```
- [ ] `computeApuracao(cd, params: ParametrosFiscais = PARAMETROS_PADRAO)`. No bloco LP, trocar constantes por params: `pIrpj = equip ? 0.08 : (atividade==="Serviços"?params.presIrpjServicos:params.presIrpjComercio)/100`; idem `pCsll` (`presCsll*`); `baseIrpj = baseLP(revenue,pIrpj,params)`, `baseCsll = baseLP(revenue,pCsll,params)`; `irpj = baseIrpj*params.irpjRate/100`; `adic = Math.max(0, baseIrpj - params.irpjAdicLimiteMensal) * params.irpjAdicRate/100`; `csll = baseCsll*params.csllRate/100`. PIS/COFINS: `revenue*params.pisCumulativo/100` e `revenue*params.cofinsCumulativo/100` (e taxas exibidas idem). Adicional: limite exibido = `params.irpjAdicLimiteMensal`.
- [ ] No bloco economia hospitalar, base 32%: usar `params.presIrpjServicos/100` e `params.presCsllServicos/100`.
- [ ] `calcEconomia(ap, issRate = 5, params = PARAMETROS_PADRAO)` → passa params a `simularLucroPresumido`.
- [ ] `simularLucroPresumido(revenue, atividade, issRate = 5, params = PARAMETROS_PADRAO)`: `pis=revenue*params.pisCumulativo/100`; `cofins=revenue*params.cofinsCumulativo/100`; presunções via params (serviços vs comércio); `irpj` usa `baseLP` + `params.irpjRate/irpjAdicRate/irpjAdicLimiteMensal`; `csll` via `baseLP(... presCsll ...)*params.csllRate/100`.
- [ ] `pnpm typecheck`.

## Task 4: página /configuracoes + Nav

- [ ] Criar `app/configuracoes/page.tsx` (client): carrega `getParametros()` em estado, campos numéricos agrupados (PIS/COFINS; Presunções IRPJ/CSLL serviços+comércio; IRPJ/CSLL + adicional + limite; LC 224: checkbox ativa + pct + limite anual), botões **Salvar** (`saveParametros` + toast) e **Restaurar padrão** (`PARAMETROS_PADRAO`). Usar classes `.input/.label/.card/.btn`.
- [ ] No `components/Nav.tsx`: importar ícone `Settings` (lucide) e adicionar item `{ href: "/configuracoes", label: "Configurações", icon: Settings }`.
- [ ] `pnpm typecheck` + navegador: editar e salvar persiste (recarregar mantém).

## Task 5: fiação no gerador + RelatorioMensal

- [ ] `app/relatorio/page.tsx`: `import { getParametros } from "@/lib/storage"`; estado `const [params, setParams] = useState(PARAMETROS_PADRAO)` (import de config) e `useEffect(()=>setParams(getParametros()),[])`. Passar params: `computeApuracao(cd, params)` (no `useMemo`, dep `params`), `calcEconomia(ap, issRate, params)`. Passar `params` ao `<RelatorioMensal ... params={params} />`.
- [ ] `components/RelatorioMensal.tsx`: prop `params: ParametrosFiscais` (import de config); usar em `calcEconomia(ap, parseBR(cd.issRate)||5, params)`.
- [ ] `pnpm typecheck` + navegador end-to-end: em /configuracoes mudar presunção serviços 32→16 e salvar; em /relatorio (LP serviços) IRPJ/CSLL e a comparação caem ~metade; majoração: receita mensal > limite/12 eleva a base; "Restaurar padrão" reverte.

## Self-Review

Cobertura: config (T1) → storage (T2) → motor+majoração (T3) → UI+nav (T4) → fiação (T5). Tipos: `ParametrosFiscais` em config, usado por storage/engine/página/RelatorioMensal; assinaturas com default `PARAMETROS_PADRAO` (retrocompatível). Sem placeholders.
