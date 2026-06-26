# Comparativo real + editor por grade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps usam checkbox `- [ ]`.

**Goal:** Comparativo Simples × Lucro Presumido com folha/pró-labore (carga total real), apresentado em tabela lado a lado, e aba Editar reorganizada com grade editável de impostos (valor + vencimento).

**Architecture:** `simularComparativo` reaproveita `computeApuracao` para cada regime. Overrides por tributo (`cd.overrides`) editados na grade e aplicados no motor. RelatorioMensal troca barras por tabela.

**Tech Stack:** Next.js 15, React 19, TS, Tailwind. Spec: [docs/superpowers/specs/2026-06-26-comparativo-real-e-editor-design.md](../specs/2026-06-26-comparativo-real-e-editor-design.md).

## Global Constraints
- Sem testes/git → verificação = `pnpm typecheck` + navegador (preview "gn" 3212). Sem commits.
- Percentuais inteiros; monetários string pt-BR; PT-BR na UI.

---

## Task 1: tipos — overrides + TaxRow.id

**Files:** Modify `lib/types.ts`

- [ ] Em `ClientData`, após `repartManual?`, adicionar:
```typescript
  /** Ajustes manuais por tributo (grade "Impostos a recolher"): valor e/ou vencimento. */
  overrides?: Record<string, { value?: string; dueDate?: string }>
```
- [ ] Em `TaxRow`, após `manual?`, adicionar:
```typescript
  /** Preenchido nas linhas manuais com o id do extraTax (p/ a grade gravar de volta). */
  id?: string
```
- [ ] `pnpm typecheck` → sem erros.

---

## Task 2: motor aplica overrides

**Files:** Modify `lib/engine.ts`

**Interfaces:** Consome `ClientData.overrides`, `TaxRow.id` (Task 1).

- [ ] **DAS usa override do valor** (reescala repartição). Localizar no bloco SN:
```typescript
    const dasOff = parseBR(cd.dasOfficial)
```
e trocar por:
```typescript
    const dasOff = parseBR(cd.overrides?.["DAS"]?.value || cd.dasOfficial)
```
- [ ] **Linhas manuais carregam id.** No bloco de `extraTaxes`, no objeto `taxes.push({...})`, acrescentar `id: e.id,` (logo após `manual: true,`).
- [ ] **Aplicar overrides antes dos totais.** Localizar o comentário `// ---------- TOTAIS ----------` e, imediatamente ANTES dele, inserir:
```typescript
  // ---------- AJUSTES MANUAIS (grade) ----------
  const ov = cd.overrides || {}
  taxes.forEach((t) => {
    const o = ov[t.tax]
    if (!o) return
    if (o.value !== undefined && o.value !== "") t.value = fmtNum(parseBR(o.value))
    if (o.dueDate) t.dueDate = o.dueDate
  })
```
- [ ] `pnpm typecheck`.

---

## Task 3: motor — simularComparativo

**Files:** Modify `lib/engine.ts`

**Interfaces:** Produz `simularComparativo(cd: ClientData, ap: Apuracao, params?: ParametrosFiscais): Comparativo`. Task 4 consome.

- [ ] Adicionar tipos + função (no fim do arquivo):
```typescript
export interface CompLinha { tributo: string; simples: number; presumido: number }
export interface Comparativo {
  linhas: CompLinha[]
  totalSimples: number
  totalPresumido: number
  economia: number
  melhor: "Simples Nacional" | "Lucro Presumido"
  atual: string
  simulavel: boolean
}

const COMP_ORDEM = ["DAS", "PIS", "COFINS", "IRPJ", "Adicional IRPJ", "CSLL", "ISS", "ICMS", "CPP (Patronal)", "RAT", "Terceiros", "FGTS", "INSS (Pró-labore)"]
const COMP_EXCLUI = ["INSS (Folha)", "IRRF (Folha)"]

export function simularComparativo(cd: ClientData, ap: Apuracao, params: ParametrosFiscais = PARAMETROS_PADRAO): Comparativo {
  const atual = cd.regime
  const isSN = atual === "Simples Nacional"
  const isLP = atual === "Lucro Presumido" || atual === "Lucro Real"
  const base: ClientData = { ...cd, overrides: undefined }
  const apS = isSN ? ap : computeApuracao({ ...base, regime: "Simples Nacional", anexo: cd.anexo || "Anexo III" }, params)
  const apP = isLP ? ap : computeApuracao({ ...base, regime: "Lucro Presumido" }, params)

  const somaPorTributo = (a: Apuracao) => {
    const m: Record<string, number> = {}
    a.taxes.filter((t) => !t.manual && !COMP_EXCLUI.includes(t.tax)).forEach((t) => { m[t.tax] = (m[t.tax] || 0) + parseBR(t.value) })
    return m
  }
  const sMap = somaPorTributo(apS)
  const pMap = somaPorTributo(apP)
  const nomes = [...COMP_ORDEM.filter((n) => sMap[n] || pMap[n]), ...Object.keys({ ...sMap, ...pMap }).filter((n) => !COMP_ORDEM.includes(n))]
  const linhas: CompLinha[] = nomes.map((n) => ({ tributo: n, simples: sMap[n] || 0, presumido: pMap[n] || 0 }))
  const totalSimples = linhas.reduce((s, l) => s + l.simples, 0)
  const totalPresumido = linhas.reduce((s, l) => s + l.presumido, 0)
  // simulável: o regime NÃO-atual precisa ter base p/ simular (Simples exige RBT12)
  const simulavel = isSN ? totalPresumido > 0 : parseBR(cd.rbt12) > 0 && totalSimples > 0
  return {
    linhas, totalSimples, totalPresumido,
    economia: Math.abs(totalSimples - totalPresumido),
    melhor: totalSimples <= totalPresumido ? "Simples Nacional" : "Lucro Presumido",
    atual, simulavel,
  }
}
```
- [ ] `pnpm typecheck`.

---

## Task 4: relatório — tabela comparativa

**Files:** Modify `components/RelatorioMensal.tsx`

**Interfaces:** Consome `simularComparativo`, `Comparativo` (Task 3).

- [ ] Importar do engine: trocar `import { calcEconomia } from "@/lib/engine"` por `import { simularComparativo } from "@/lib/engine"`.
- [ ] Substituir o cálculo de economia. Localizar:
```typescript
  const eco = calcEconomia(ap, parseBR(cd.issRate) || params.issPadrao, params)
  const economiaMes = eco.valor
  const sim = eco.sim
  const ecoTipo = eco.tipo
```
e trocar por:
```typescript
  const comp = simularComparativo(cd, ap, params)
  const outroRegime = comp.atual === "Simples Nacional" ? "Lucro Presumido" : "Simples Nacional"
  const economiaMes = comp.economia
  const showEco = comp.simulavel && comp.economia > 0.5
  const ecoLabel = `vs. ${outroRegime}`
```
- [ ] Remover usos órfãos de `sim`/`ecoTipo`/`ecoPct`/`maxCmp`/`simplesVal`/`presumidoVal`/`economiaNote`/`segTxt`/`segTipos` ligados ao comparativo antigo. Substituir o bloco `const showEco = ...` antigo (e derivados) pela versão acima; onde `ecoTipo`/`sim` eram usados nos KPIs/anéis, usar `ecoLabel`/`economiaMes`. Onde havia `economiaNote` (painel/`GoldEconomia`), passar a **tabela comparativa** (abaixo).
- [ ] Componente da tabela (adicionar perto de `CmpRow`):
```tsx
function CompTable({ comp, outro }: { comp: ReturnType<typeof simularComparativo>; outro: string }) {
  if (!comp.simulavel) return <div className="g-note">Informe RBT12 e o anexo para comparar com o Simples Nacional.</div>
  const cell = (v: number) => (v > 0.005 ? fmtBRL(v) : "—")
  return (
    <div className="ctbl">
      <div className="ctbl-h"><span>Tributo</span><span>Simples Nacional</span><span>Lucro Presumido</span></div>
      {comp.linhas.map((l) => (
        <div className="ctbl-r" key={l.tributo}><span>{l.tributo}</span><span className="num">{cell(l.simples)}</span><span className="num">{cell(l.presumido)}</span></div>
      ))}
      <div className="ctbl-t"><span>Total</span><span className="num">{fmtBRL(comp.totalSimples)}</span><span className="num">{fmtBRL(comp.totalPresumido)}</span></div>
      <div className="ctbl-eco">Economia no <b>{comp.melhor}</b>: <b>{fmtBRL(comp.economia)}/mês</b></div>
    </div>
  )
}
```
- [ ] CSS (no `STYLE`, antes do `@media print`):
```css
.gn-doc .ctbl{display:flex;flex-direction:column;border:1px solid var(--bd);border-radius:12px;overflow:hidden;background:var(--card)}
.gn-doc .ctbl-h,.gn-doc .ctbl-r,.gn-doc .ctbl-t{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:8px;padding:8px 14px;align-items:center}
.gn-doc .ctbl-h{background:#f4f1ea;font:600 8.5px 'Jost';letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.gn-doc .ctbl-h span:not(:first-child),.gn-doc .ctbl-r .num,.gn-doc .ctbl-t .num{text-align:right}
.gn-doc .ctbl-r{font:400 10.5px 'IBM Plex Sans';color:#334023;border-top:1px solid var(--bd2)}
.gn-doc .ctbl-t{border-top:2px solid var(--bd);font:700 11px 'Jost';color:var(--num);background:#fbf8ee}
.gn-doc .ctbl-eco{padding:9px 14px;background:var(--green-dk);color:#f5f1e6;font:400 10.5px 'IBM Plex Sans';text-align:center}
.gn-doc .ctbl-eco b{color:#fff}
```
- [ ] Onde o relatório mostrava o painel de economia (page 1 e/ou 3 via `economiaNote`/`GoldEconomia`), renderizar `<CompTable comp={comp} outro={outroRegime} />` na seção "Economia/Comparativo". Manter o KPI/anel usando `economiaMes`/`ecoLabel`/`showEco`.
- [ ] `pnpm typecheck` + navegador: SN serviços com folha → tabela com CPP/RAT/Terceiros no Presumido; total e economia coerentes.

---

## Task 5: editor por blocos + grade editável

**Files:** Modify `app/relatorio/page.tsx`

**Interfaces:** Consome `ap.taxes` (com `id`/`manual`), grava `cd.overrides` e `cd.extraTaxes`.

- [ ] **Handlers de override + recalcular.** Após `delItem`, adicionar:
```typescript
  const setOverride = (tax: string, field: "value" | "dueDate", v: string) =>
    setCd((p) => ({ ...p, overrides: { ...(p.overrides || {}), [tax]: { ...(p.overrides?.[tax] || {}), [field]: v } } }))
  const recalcular = () => setCd((p) => { const n = { ...p }; delete n.overrides; return n })
```
- [ ] **Limpar overrides em mudança estrutural.** Em `upd`, na lista de chaves que apagam `repartManual`, incluir limpar overrides:
```typescript
      if (["revenue", "rbt12", "anexo", "atividade", "regime"].includes(k as string)) { delete next.repartManual }
      if (["anexo", "atividade", "regime"].includes(k as string)) { delete next.overrides }
```
- [ ] **Grade "Impostos a recolher".** Substituir o card "Outras guias e itens" inteiro (e o card "Repartição do DAS & ajustes", se presente) por um único card com a grade sobre `ap.taxes`:
```tsx
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2"><Scale className="h-4 w-4" /> Impostos a recolher</h2>
              <div className="flex gap-2">
                <button className="btn btn-outline text-xs px-2 py-1" onClick={recalcular}>Recalcular</button>
                <button className="btn btn-outline text-xs px-2 py-1" onClick={addItem}><Plus className="h-3.5 w-3.5" /> Adicionar guia</button>
              </div>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] uppercase font-semibold text-[var(--muted)] px-1 mb-1">
              <div className="col-span-5">Tributo</div><div className="col-span-3">Valor (R$)</div><div className="col-span-3">Vencimento</div><div className="col-span-1"></div>
            </div>
            <div className="space-y-2">
              {ap.taxes.map((t, i) => {
                const manual = !!t.manual
                const e = manual ? (cd.extraTaxes || []).find((x) => x.id === t.id) : undefined
                return (
                  <div key={t.id || t.tax || i} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center">
                    <div className="col-span-2 md:col-span-5">
                      {manual
                        ? <input className="input" value={e?.tax || ""} onChange={(ev) => updItem(t.id!, "tax", ev.target.value)} placeholder="Nome da guia" />
                        : <div className="px-1 text-sm font-medium text-[var(--ink)]">{t.tax}<span className="text-[10px] text-[var(--muted)] ml-2">{t.group}</span></div>}
                    </div>
                    <div className="md:col-span-3">
                      <Money value={manual ? e?.value : (cd.overrides?.[t.tax]?.value ?? t.value)} onChange={(v) => manual ? updItem(t.id!, "value", v) : setOverride(t.tax, "value", v)} />
                    </div>
                    <div className="md:col-span-3">
                      <input type="date" className="input" value={brToISO(manual ? (e?.dueDate || "") : (cd.overrides?.[t.tax]?.dueDate || t.dueDate))} onChange={(ev) => { const br = ev.target.value ? isoToBR(ev.target.value) : ""; manual ? updItem(t.id!, "dueDate", br) : setOverride(t.tax, "dueDate", br) }} />
                    </div>
                    <div className="md:col-span-1">{manual && <button className="btn btn-outline px-2 py-2 text-red-600 w-full" onClick={() => delItem(t.id!)} aria-label="Remover"><Trash2 className="h-3.5 w-3.5" /></button>}</div>
                  </div>
                )
              })}
              {ap.taxes.length === 0 && <div className="text-sm text-[var(--muted)] px-1">Informe o faturamento (ou importe o PGDAS-D) para calcular os impostos.</div>}
            </div>
          </div>
```
- [ ] **Enxugar textos.** Nos cards de Identificação, PGDAS, MEI e "Dados do mês": remover os parágrafos `<p className="text-xs ...">` longos (manter no máximo uma frase curta de ajuda no PGDAS). Não alterar os inputs existentes de cálculo.
- [ ] `pnpm typecheck` + navegador (end-to-end): (a) SN com folha → grade lista DAS/FGTS/INSS pró-labore; (b) editar Valor de uma linha calculada → total e Agenda mudam; (c) editar Vencimento → muda no calendário; (d) "Recalcular" reverte; (e) "Adicionar guia" cria linha manual editável e removível; (f) DAS editado reescala o donut.

---

## Self-Review
- **Cobertura:** Parte 1 → Tasks 2–3; Parte 2 → Task 4; Parte 3 → Tasks 1,5. overrides/TaxRow.id → Task 1, usados em 2/5. Sem lacunas.
- **Tipos:** `Comparativo`/`CompLinha`/`simularComparativo` definidos na Task 3 e usados na 4; `overrides`/`TaxRow.id` na Task 1 e usados em 2/5; `setOverride`/`recalcular` na Task 5. `brToISO`/`isoToBR`/`Money`/`addItem`/`updItem`/`delItem` já existem no arquivo.
- **Placeholders:** nenhum.
