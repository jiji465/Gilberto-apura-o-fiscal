# Parcelamentos no relatório do cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir lançar a parcela de um parcelamento no mês e exibi-la, com tratamento próprio, no calendário, na lista de vencimentos e no total do relatório enviado ao cliente.

**Architecture:** Reaproveita o editor "Outras guias e itens" (`extraTaxes`) já existente. Um item do grupo "Parcelamento" ganha dois campos opcionais (nº/total de parcelas); o motor (`computeApuracao`) deriva o rótulo "X de Y" no `TaxRow`; o componente do relatório dá etiqueta "PARC" e rótulo "parcela X de Y" no calendário e nos vencimentos. Sem novos arquivos, sem cadastro fixo, sem status.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3. Verificação por `pnpm typecheck` + navegador (Claude Preview na porta 3212).

## Global Constraints

- Projeto em `C:\Users\Admin\Downloads\GILBERTO`. Sem framework de testes — verificação = `pnpm typecheck` + checagem no navegador (mesma prática de todo o projeto).
- Monetários trafegam como string pt-BR ("1.234,56"); usar os helpers de `lib/format.ts`.
- O grupo novo chama-se exatamente **"Parcelamento"** (string usada em editor, motor e relatório).
- Não adicionar controle de status nem obrigações acessórias.
- Idioma de toda a UI/texto: português.

---

## Task 0: Versionamento (opcional)

**Files:** nenhum (apenas git).

Este projeto não é um repositório git. Para ter os checkpoints de commit deste plano, inicialize o git uma vez. **Se você não quiser versionar, pule esta task e ignore os passos "Commit" das tasks seguintes.**

- [ ] **Step 1: Inicializar git e primeiro commit**

```bash
cd /c/Users/Admin/Downloads/GILBERTO
git init
git add -A
git commit -m "chore: estado inicial antes dos parcelamentos"
```

Expected: repositório criado; commit inicial registrado.

---

## Task 1: Tipos — campos de parcela

**Files:**
- Modify: `lib/types.ts` (interface `ExtraTax`; interface `TaxRow`)

**Interfaces:**
- Produces: `ExtraTax.parcelaNum?: string`, `ExtraTax.parcelaTot?: string`, `TaxRow.parcela?: string` (ex.: "3 de 12"). Tasks 2/3/4 dependem destes nomes.

- [ ] **Step 1: Adicionar campos a `ExtraTax`**

Em `lib/types.ts`, na interface `ExtraTax`, acrescentar os dois campos (depois de `group?`):

```typescript
export interface ExtraTax {
  id?: string
  tax: string
  base?: string
  rate?: string
  value?: string
  retido?: string
  dueDate?: string
  obs?: string
  group?: string
  /** Parcelamento: número da parcela e total (ex.: "3" e "12"). */
  parcelaNum?: string
  parcelaTot?: string
}
```

- [ ] **Step 2: Adicionar `parcela` a `TaxRow`**

Na interface `TaxRow`, acrescentar (depois de `manual?`):

```typescript
export interface TaxRow {
  tax: string
  base: string
  rate: string
  apurado: string
  retido: string
  value: string
  dueDate: string
  obs: string
  group: string
  manual?: boolean
  /** Preenchido pelo motor p/ itens de Parcelamento: "3 de 12". */
  parcela?: string
}
```

- [ ] **Step 3: Verificar tipos**

Run: `cd /c/Users/Admin/Downloads/GILBERTO && pnpm typecheck`
Expected: sem erros (os campos são opcionais; nada quebra).

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): campos de parcela em ExtraTax e TaxRow"
```

---

## Task 2: Motor — derivar "X de Y"

**Files:**
- Modify: `lib/engine.ts` (bloco `;(cd.extraTaxes || []).forEach(...)` dentro de `computeApuracao`)

**Interfaces:**
- Consumes: `ExtraTax.parcelaNum/parcelaTot` (Task 1).
- Produces: cada `TaxRow` gerado de um `extraTax` com `group === "Parcelamento"` e `parcelaNum` preenchido recebe `parcela = "<num> de <tot|?>"`. Task 4 lê `TaxRow.parcela`.

- [ ] **Step 1: Comportamento esperado (assert mental)**

Para `extraTaxes = [{ tax: "Parcelamento DAS", value: "1.000,00", dueDate: "20/06/2026", group: "Parcelamento", parcelaNum: "3", parcelaTot: "12" }]`, o `TaxRow` resultante deve ter `parcela === "3 de 12"`, `value === "1.000,00"`, `group === "Parcelamento"`, e continuar somando no total (`totPagar`).

- [ ] **Step 2: Implementar**

Em `lib/engine.ts`, localizar o bloco que mapeia `extraTaxes` e substituí-lo por:

```typescript
  // ---------- TRIBUTOS ADICIONAIS (manuais) ----------
  ;(cd.extraTaxes || []).forEach((e) => {
    if (!e.tax) return
    const apur = parseBR(e.value)
    const isParc = e.group === "Parcelamento"
    taxes.push({
      tax: e.tax, base: e.base ? fmtNum(e.base) : "", rate: e.rate || "",
      apurado: fmtNum(apur), retido: e.retido ? fmtNum(e.retido) : "",
      value: fmtNum(Math.max(0, apur - parseBR(e.retido))),
      dueDate: e.dueDate || "", obs: e.obs || "", group: e.group || "Outros", manual: true,
      parcela: isParc && e.parcelaNum ? `${e.parcelaNum} de ${e.parcelaTot || "?"}` : undefined,
    })
  })
```

- [ ] **Step 3: Verificar tipos**

Run: `cd /c/Users/Admin/Downloads/GILBERTO && pnpm typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add lib/engine.ts
git commit -m "feat(engine): rótulo 'X de Y' para itens de Parcelamento"
```

---

## Task 3: Editor — grupo "Parcelamento" + campos de parcela

**Files:**
- Modify: `app/relatorio/page.tsx` (const `ITEM_GRUPOS`; cabeçalho e linha do card "Outras guias e itens")

**Interfaces:**
- Consumes: `ExtraTax.parcelaNum/parcelaTot` (Task 1); handlers existentes `updItem(id, field, v)`, `delItem(id)`.
- Produces: UI que grava `group: "Parcelamento"`, `parcelaNum`, `parcelaTot` em `cd.extraTaxes`.

- [ ] **Step 1: Adicionar "Parcelamento" aos grupos**

Localizar `const ITEM_GRUPOS = ["DAS", "Folha", "PIS/COFINS", "IRPJ/CSLL", "ISS", "ICMS", "Outros"]` e trocar por:

```typescript
const ITEM_GRUPOS = ["DAS", "Folha", "PIS/COFINS", "IRPJ/CSLL", "ISS", "ICMS", "Parcelamento", "Outros"]
```

- [ ] **Step 2: Atualizar o cabeçalho da grade**

No card "Outras guias e itens", o cabeçalho `<div className="hidden md:grid grid-cols-12 ...">` tem `<div className="col-span-2">Retido</div>`. Trocar essa célula por:

```tsx
                  <div className="col-span-2">Retido / parcela</div>
```

- [ ] **Step 3: Render condicional na linha do item**

Na linha do item, localizar a coluna do Retido:

```tsx
                    <div className="md:col-span-2"><Money value={e.retido} onChange={(v) => updItem(e.id!, "retido", v)} /></div>
```

e substituí-la por (mostra nº/total de parcela quando o grupo for Parcelamento; senão, Retido):

```tsx
                    {e.group === "Parcelamento" ? (
                      <>
                        <div className="md:col-span-1"><input className="input" inputMode="numeric" value={e.parcelaNum || ""} onChange={(ev) => updItem(e.id!, "parcelaNum", ev.target.value.replace(/\D/g, ""))} placeholder="nº" /></div>
                        <div className="md:col-span-1"><input className="input" inputMode="numeric" value={e.parcelaTot || ""} onChange={(ev) => updItem(e.id!, "parcelaTot", ev.target.value.replace(/\D/g, ""))} placeholder="de" /></div>
                      </>
                    ) : (
                      <div className="md:col-span-2"><Money value={e.retido} onChange={(v) => updItem(e.id!, "retido", v)} /></div>
                    )}
```

- [ ] **Step 4: Verificar tipos**

Run: `cd /c/Users/Admin/Downloads/GILBERTO && pnpm typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add app/relatorio/page.tsx
git commit -m "feat(editor): grupo Parcelamento com campos nº/total de parcela"
```

---

## Task 4: Relatório — etiqueta PARC, rótulo "parcela X de Y", calendário

**Files:**
- Modify: `components/RelatorioMensal.tsx` (helper de etiqueta; construção de `payDays`; construção de `payRows`)

**Interfaces:**
- Consumes: `TaxRow.group`, `TaxRow.parcela` (Tasks 1/2).
- Produces: vencimentos e calendário com etiqueta "PARC" e subtítulo "Parcelamento · parcela X de Y".

- [ ] **Step 1: Helper de etiqueta consciente do grupo**

Logo após a função `guiaTag` existente, adicionar:

```typescript
function itemTag(t: TaxRow) {
  return t.group === "Parcelamento" ? "PARC" : guiaTag(t.tax)
}
```

- [ ] **Step 2: Calendário usa o grupo**

Localizar a construção de `payDays`:

```typescript
  dueGroups.forEach((g) => { const p = g.date.split("/"); if (+p[2] === calY && +p[1] === calM) payDays[+p[0]] = g.items.map((t) => guiaTag(t.tax)).filter(uniq).join(" · ") })
```

trocar `guiaTag(t.tax)` por `itemTag(t)`:

```typescript
  dueGroups.forEach((g) => { const p = g.date.split("/"); if (+p[2] === calY && +p[1] === calM) payDays[+p[0]] = g.items.map((t) => itemTag(t)).filter(uniq).join(" · ") })
```

- [ ] **Step 3: Lista de vencimentos com parcela**

Localizar a construção de `payRows`:

```typescript
  const payRows: VItem[] = dueGroups.map((g) => ({
    kind: "pay", day: g.day, mo: g.mo.toUpperCase(), name: g.items.map((t) => t.tax).join(" + "),
    sub: g.items.map((t) => guiaTag(t.tax)).filter(uniq).join(" · ") + (isSN ? " · comp. " + monthName.toLowerCase() : ""),
    value: g.total, tag: diffLabel(g.diff), hl: g.diff < 0 || g.diff <= 5,
  }))
```

substituir por (tags conscientes do grupo + sufixo "parcela X de Y" quando houver):

```typescript
  const payRows: VItem[] = dueGroups.map((g) => {
    const parc = g.items.find((t) => t.group === "Parcelamento" && t.parcela)
    const tags = g.items.map((t) => itemTag(t)).filter(uniq).join(" · ")
    return {
      kind: "pay" as const, day: g.day, mo: g.mo.toUpperCase(), name: g.items.map((t) => t.tax).join(" + "),
      sub: tags + (parc ? ` · parcela ${parc.parcela}` : isSN ? " · comp. " + monthName.toLowerCase() : ""),
      value: g.total, tag: diffLabel(g.diff), hl: g.diff < 0 || g.diff <= 5,
    }
  })
```

- [ ] **Step 4: Verificar tipos**

Run: `cd /c/Users/Admin/Downloads/GILBERTO && pnpm typecheck`
Expected: sem erros.

- [ ] **Step 5: Verificação no navegador (end-to-end)**

Com o dev server na porta 3212 (preview "gn"):
1. Abrir `/relatorio`, selecionar/colar uma competência (ex.: Clínica Tavares) e Preencher.
2. No card "Outras guias e itens" → "Adicionar item": Tributo "Parcelamento DAS"; Valor 100000 (→ R$ 1.000,00); Vencimento 2026-06-20; Grupo **Parcelamento**; nº **3**; de **12**.
3. Aba **Visualizar** e conferir:
   - na **lista de vencimentos** (Agenda Fiscal) aparece "Parcelamento DAS" com subtítulo "PARC · parcela 3 de 12";
   - o dia 20 no **calendário** mostra a etiqueta "PARC";
   - o **Total a recolher** somou os R$ 1.000,00.

Comando de leitura (DOM) para conferência rápida via preview_eval:
```js
(()=>{const o=document.getElementById('rep-overlay');return {vrows:[...o.querySelectorAll('.vrow .vn')].map(v=>v.textContent),subs:[...o.querySelectorAll('.vrow .vsub')].map(v=>v.textContent)}})()
```
Expected: um vrow com `vn` "Parcelamento DAS" e `vsub` contendo "parcela 3 de 12".

- [ ] **Step 6: Commit**

```bash
git add components/RelatorioMensal.tsx
git commit -m "feat(relatorio): parcelamento no calendário e nos vencimentos (PARC + parcela X de Y)"
```

---

## Self-Review (preenchido)

- **Cobertura da spec:** (1) campo de grupo Parcelamento → Task 3; (2) campos nº/total → Tasks 1+3; (3) rótulo "X de Y" → Task 2; (4) etiqueta PARC no calendário → Task 4 Step 2; (5) "parcela X de Y" na lista → Task 4 Step 3; (6) soma no total → comportamento existente (item normal), confirmado na verificação. Sem lacunas.
- **Placeholders:** nenhum — todo passo tem código real.
- **Consistência de tipos:** `parcelaNum/parcelaTot` (string) definidos na Task 1 e usados nas Tasks 2/3; `TaxRow.parcela` definido na Task 1, gravado na Task 2, lido na Task 4; helper `itemTag(t: TaxRow)` definido e usado na Task 4. Coerente.
