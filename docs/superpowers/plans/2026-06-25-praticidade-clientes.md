# Praticidade de clientes no gerador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o `<select>` de empresa do gerador por um combobox de busca, permitir cadastrar/editar a empresa sem sair do gerador (modal compartilhado) e mostrar as competências já salvas com atalho para a última.

**Architecture:** Duas peças novas isoladas — `ClienteModal` (extraído do modal embutido em `/clientes`) e `ClientePicker` (combobox) — mais a integração no gerador e um pequeno refactor (`novoCliente()` para `lib/storage.ts`). Reaproveita `lib/storage.ts`, BrasilAPI e o `useEffect` que já reabre competências salvas.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, lucide-react. Spec: [docs/superpowers/specs/2026-06-25-praticidade-clientes-design.md](../specs/2026-06-25-praticidade-clientes-design.md).

## Global Constraints

- Projeto em `C:\Users\Admin\Downloads\GILBERTO`. **Sem framework de testes e sem git** — verificação = `pnpm typecheck` + checagem no navegador (preview "gn", porta 3212). Não há passos de commit.
- Monetários e UI em português; seguir os componentes/classes existentes (`.input`, `.btn`, `.chip`, `.card`, variáveis CSS `--muted`/`--line`/`--navy`).
- Tipos do domínio em `lib/types.ts` (`Cliente`, `ApuracaoRecord`). Não alterar a forma de `Cliente`.
- `localStorage` é a única persistência (`lib/storage.ts`).

---

## Task 1: `novoCliente()` compartilhado em `lib/storage.ts`

**Files:**
- Modify: `lib/storage.ts`

**Interfaces:**
- Produces: `novoCliente(): Cliente` — Cliente em branco com `id` via `uid()` e defaults (Simples Nacional / Serviços / Anexo III / ativo). Tasks 2 e 4 consomem.

- [ ] **Step 1: Adicionar a função**

Em `lib/storage.ts`, logo após `export function uid()`, adicionar:

```typescript
/** Cliente em branco com defaults (usado pelo cadastro nas telas Clientes e Relatório). */
export function novoCliente(): Cliente {
  return { id: uid(), nome: "", regime: "Simples Nacional", atividade: "Serviços", anexo: "Anexo III", ativo: true, criadoEm: new Date().toISOString() }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd /c/Users/Admin/Downloads/GILBERTO && pnpm typecheck`
Expected: sem erros (`Cliente` já está importado em `storage.ts`).

---

## Task 2: `components/ClienteModal.tsx` + refactor de `/clientes`

**Files:**
- Create: `components/ClienteModal.tsx`
- Modify: `app/clientes/page.tsx`

**Interfaces:**
- Consumes: `saveCliente` (storage), `novoCliente` (Task 1), `fmtCNPJ` (format), toasts.
- Produces: `ClienteModal({ cliente, onClose, onSaved })` — `cliente: Cliente`, `onClose: () => void`, `onSaved: (c: Cliente) => void`. Task 4 consome.

- [ ] **Step 1: Criar o componente**

Criar `components/ClienteModal.tsx`:

```tsx
"use client"

import { useState } from "react"
import { Building2, X } from "lucide-react"
import { fmtCNPJ } from "@/lib/format"
import { saveCliente } from "@/lib/storage"
import { toastSuccess, toastError } from "@/lib/toast"
import type { Anexo, Atividade, Cliente, Regime } from "@/lib/types"

const REGIMES: Regime[] = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI"]
const ATIVIDADES: Atividade[] = ["Serviços", "Comércio", "Indústria"]
const ANEXOS: Anexo[] = ["Anexo I", "Anexo II", "Anexo III", "Anexo IV", "Anexo V"]

export function ClienteModal({ cliente, onClose, onSaved }: { cliente: Cliente; onClose: () => void; onSaved: (c: Cliente) => void }) {
  const [edit, setEdit] = useState<Cliente>(cliente)
  const [busy, setBusy] = useState(false)
  const titulo = edit.nome.trim() ? "Editar cliente" : "Novo cliente"

  async function buscarCNPJ() {
    const d = (edit.cnpj || "").replace(/\D/g, "")
    if (d.length !== 14) { toastError("Digite os 14 dígitos do CNPJ."); return }
    setBusy(true)
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`)
      if (!r.ok) throw new Error("não encontrado")
      const j = await r.json()
      setEdit((p) => ({ ...p, nome: j.razao_social || p.nome, email: j.email || p.email, telefone: j.ddd_telefone_1 || p.telefone, municipio: j.municipio || p.municipio, uf: j.uf || p.uf }))
      toastSuccess(`Encontrado: ${j.razao_social}`)
    } catch {
      toastError("Não consegui consultar o CNPJ. Preencha manualmente.")
    }
    setBusy(false)
  }

  function salvar() {
    if (!edit.nome.trim()) { toastError("Informe o nome/razão social."); return }
    const saved = saveCliente({ ...edit, nome: edit.nome.trim(), cnpj: edit.cnpj?.replace(/\D/g, "") })
    toastSuccess(`Cliente ${saved.nome} salvo.`)
    onSaved(saved)
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl p-6 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif text-lg text-[var(--navy)] flex items-center gap-2"><Building2 className="h-5 w-5" /> {titulo}</h2>
          <button className="text-[var(--muted)] hover:text-[var(--ink)]" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="label">CNPJ</label>
            <div className="flex gap-2">
              <input className="input" value={edit.cnpj ? fmtCNPJ(edit.cnpj) : ""} onChange={(e) => setEdit({ ...edit, cnpj: e.target.value.replace(/\D/g, "").slice(0, 14) })} placeholder="00.000.000/0000-00" />
              <button className="btn btn-outline whitespace-nowrap" disabled={busy} onClick={buscarCNPJ}>{busy ? "Buscando…" : "Buscar"}</button>
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="label">Razão social / Nome</label>
            <input className="input" value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} />
          </div>
          <div>
            <label className="label">E-mail (para envio)</label>
            <input className="input" value={edit.email || ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} placeholder="cliente@empresa.com" />
          </div>
          <div>
            <label className="label">Telefone</label>
            <input className="input" value={edit.telefone || ""} onChange={(e) => setEdit({ ...edit, telefone: e.target.value })} />
          </div>
          <div>
            <label className="label">Regime</label>
            <select className="input" value={edit.regime} onChange={(e) => setEdit({ ...edit, regime: e.target.value as Regime })}>
              {REGIMES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Atividade</label>
            <select className="input" value={edit.atividade} onChange={(e) => setEdit({ ...edit, atividade: e.target.value as Atividade })}>
              {ATIVIDADES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {edit.regime === "Simples Nacional" && (
            <div>
              <label className="label">Anexo</label>
              <select className="input" value={edit.anexo || ""} onChange={(e) => setEdit({ ...edit, anexo: e.target.value as Anexo })}>
                {ANEXOS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Município / UF</label>
            <div className="flex gap-2">
              <input className="input" value={edit.municipio || ""} onChange={(e) => setEdit({ ...edit, municipio: e.target.value })} placeholder="Município" />
              <input className="input w-20" value={edit.uf || ""} onChange={(e) => setEdit({ ...edit, uf: e.target.value.toUpperCase().slice(0, 2) })} placeholder="UF" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar}>Salvar cliente</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Refatorar `app/clientes/page.tsx` para usar o modal**

Em `app/clientes/page.tsx`:
1. Adicionar import: `import { ClienteModal } from "@/components/ClienteModal"`.
2. Trocar o import de storage para incluir `novoCliente`: `import { listClientes, deleteCliente, novoCliente } from "@/lib/storage"` (remover `saveCliente` e `uid` se não usados em outro lugar do arquivo; `saveCliente` agora vive no modal).
3. Remover a função local `novo()` (substituída por `novoCliente`); trocar `onClick={() => setEdit(novo())}` por `onClick={() => setEdit(novoCliente())}`.
4. Remover do componente as funções `salvar()` e `buscarCNPJ()` e o estado `busy` (agora no modal). Manter `remover()`.
5. Remover os imports não usados (`Plus` permanece para o botão "Novo cliente"; remover `Building2`, `X`, `fmtCNPJ` **somente se** não forem mais usados na tabela — `fmtCNPJ` ainda é usado na tabela, então mantê-lo; `Building2`/`X` saem).
6. Substituir todo o bloco `{edit && ( ... modal inline ... )}` por:

```tsx
      {edit && (
        <ClienteModal
          cliente={edit}
          onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); reload() }}
        />
      )}
```

- [ ] **Step 3: Verificar tipos**

Run: `cd /c/Users/Admin/Downloads/GILBERTO && pnpm typecheck`
Expected: sem erros. Se acusar import não usado, remover o import correspondente.

- [ ] **Step 4: Verificar no navegador (`/clientes`)**

Com o preview "gn" (porta 3212):
1. Abrir `/clientes` → "Novo cliente": preencher nome, salvar → aparece na lista.
2. "Editar" (lápis) num cliente → alterar e-mail, salvar → muda na lista.
3. Excluir → some da lista.

Comando de conferência via preview_eval (DOM):
```js
[...document.querySelectorAll('table tbody tr td:first-child')].map(t=>t.textContent)
```
Expected: lista reflete os clientes salvos.

---

## Task 3: `components/ClientePicker.tsx` (combobox)

**Files:**
- Create: `components/ClientePicker.tsx`

**Interfaces:**
- Consumes: `fmtCNPJ` (format), `Cliente` (types).
- Produces: `ClientePicker({ clientes, value, onSelect, onNew, onEdit })` — `clientes: Cliente[]`, `value: string` (id selecionado), `onSelect: (id: string) => void`, `onNew: () => void`, `onEdit: (c: Cliente) => void`. Task 4 consome.

- [ ] **Step 1: Criar o componente**

Criar `components/ClientePicker.tsx`:

```tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { Search, Plus, Pencil, ChevronDown } from "lucide-react"
import { fmtCNPJ } from "@/lib/format"
import type { Cliente } from "@/lib/types"

export function ClientePicker({ clientes, value, onSelect, onNew, onEdit }: {
  clientes: Cliente[]; value: string; onSelect: (id: string) => void; onNew: () => void; onEdit: (c: Cliente) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [hi, setHi] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const selected = clientes.find((c) => c.id === value)

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  const filtered = clientes.filter((c) => {
    const s = q.trim().toLowerCase()
    if (!s) return true
    return c.nome.toLowerCase().includes(s) || (c.cnpj || "").includes(s.replace(/\D/g, ""))
  })

  function choose(c: Cliente) { onSelect(c.id); setOpen(false); setQ("") }

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            className="input pl-9 pr-8"
            placeholder="Buscar empresa por nome ou CNPJ…"
            value={open ? q : (selected ? selected.nome + (selected.cnpj ? " — " + fmtCNPJ(selected.cnpj) : "") : "")}
            onFocus={() => { setOpen(true); setQ("") }}
            onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0) }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, filtered.length - 1)) }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
              else if (e.key === "Enter" && filtered[hi]) { e.preventDefault(); choose(filtered[hi]) }
              else if (e.key === "Escape") setOpen(false)
            }}
          />
          <ChevronDown className="h-4 w-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none" />
        </div>
        {selected && <button className="btn btn-outline px-2.5" title="Editar empresa" onClick={() => onEdit(selected)}><Pencil className="h-4 w-4" /></button>}
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-[var(--line)] rounded-lg shadow-lg max-h-72 overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-sm text-[var(--muted)]">{clientes.length === 0 ? "Nenhum cliente — cadastre." : "Nenhuma empresa encontrada."}</div>
          ) : filtered.map((c, i) => (
            <button key={c.id} type="button"
              className={"w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[#faf8f3] " + (i === hi ? "bg-[#faf8f3]" : "")}
              onMouseEnter={() => setHi(i)} onClick={() => choose(c)}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.nome}</div>
                <div className="text-xs text-[var(--muted)] tabular-nums">{c.cnpj ? fmtCNPJ(c.cnpj) : "sem CNPJ"}</div>
              </div>
              <span className="chip bg-[var(--navy-soft,#e7edf4)] text-[var(--navy)] whitespace-nowrap">{c.regime}{c.regime === "Simples Nacional" && c.anexo ? " · " + c.anexo : ""}</span>
            </button>
          ))}
          <button type="button" className="w-full text-left px-3 py-2.5 border-t border-[var(--line)] text-sm font-medium text-[var(--navy)] flex items-center gap-2 hover:bg-[#faf8f3]"
            onClick={() => { setOpen(false); onNew() }}>
            <Plus className="h-4 w-4" /> Nova empresa
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd /c/Users/Admin/Downloads/GILBERTO && pnpm typecheck`
Expected: sem erros (componente ainda não usado; só compila).

---

## Task 4: Integração no gerador (`app/relatorio/page.tsx`)

**Files:**
- Modify: `app/relatorio/page.tsx`

**Interfaces:**
- Consumes: `ClientePicker` (Task 3), `ClienteModal` (Task 2), `novoCliente` (Task 1), estado existente `clientes`/`clienteId`/`records`, `selectCliente`, `upd`.
- Produces: nada para tasks futuras.

- [ ] **Step 1: Imports e estado**

1. Adicionar imports:
```tsx
import { ClientePicker } from "@/components/ClientePicker"
import { ClienteModal } from "@/components/ClienteModal"
```
2. Incluir `novoCliente` no import de storage (linha que importa `listClientes, getCliente, ...`): acrescentar `, novoCliente`.
3. Adicionar estado do modal (junto aos outros `useState`):
```tsx
  const [clienteEdit, setClienteEdit] = useState<Cliente | undefined>()
```

- [ ] **Step 2: Handlers (auto-seleção ao salvar e abrir competência)**

Adicionar, logo após a função `selectCliente`:

```tsx
  function onClienteSaved(c: Cliente) {
    setClientes(listClientes())
    selectCliente(c.id)
    setClienteEdit(undefined)
  }
  function abrirComp(compKey: string) {
    const [y, mm] = compKey.split("-")
    upd("compYear", y)
    upd("compMonth", String(parseInt(mm)))
    upd("competenceShort", mm + "/" + y)
  }
```

- [ ] **Step 3: Substituir o `<select>` de Empresa pelo picker + faixa de competências**

Localizar o bloco da coluna "Empresa" (o `<div className="md:col-span-2">` que contém `<label>Empresa</label>` e o `<select ...>` com `clientes.map`) e substituí-lo inteiro por:

```tsx
              <div className="md:col-span-2">
                <label className="label">Empresa</label>
                <ClientePicker
                  clientes={clientes}
                  value={clienteId}
                  onSelect={selectCliente}
                  onNew={() => setClienteEdit(novoCliente())}
                  onEdit={(c) => setClienteEdit(c)}
                />
                {clientes.length === 0 && <p className="text-xs text-[var(--muted)] mt-1">Nenhum cliente. Cadastre em “Clientes” ou use “Nova empresa”.</p>}
                {clienteId && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {records.length === 0
                      ? <span className="text-xs text-[var(--muted)]">Nenhuma competência salva ainda.</span>
                      : <>
                          <span className="text-xs text-[var(--muted)] mr-1">Competências:</span>
                          {[...records].sort((a, b) => b.compKey.localeCompare(a.compKey)).map((r) => (
                            <button key={r.compKey} type="button" className="chip bg-[#f4f1ea] hover:bg-[#ece7da]" onClick={() => abrirComp(r.compKey)}>{r.competenceShort}</button>
                          ))}
                          <button type="button" className="btn btn-outline px-2 py-1 text-xs ml-1" onClick={() => abrirComp([...records].sort((a, b) => b.compKey.localeCompare(a.compKey))[0].compKey)}>Abrir última</button>
                        </>}
                  </div>
                )}
              </div>
```

- [ ] **Step 4: Renderizar o modal**

Antes do fechamento final do JSX (no fim do `return`, junto às outras seções de nível superior do componente — fora dos cards de edição), adicionar:

```tsx
      {clienteEdit && (
        <ClienteModal
          cliente={clienteEdit}
          onClose={() => setClienteEdit(undefined)}
          onSaved={onClienteSaved}
        />
      )}
```

- [ ] **Step 5: Verificar tipos**

Run: `cd /c/Users/Admin/Downloads/GILBERTO && pnpm typecheck`
Expected: sem erros. `Cliente` já está importado em `page.tsx`.

- [ ] **Step 6: Verificação no navegador (end-to-end)**

Com o preview "gn" (porta 3212), em `/relatorio` aba **Editar**:
1. **Busca:** clicar no campo Empresa → dropdown abre; digitar parte do nome e parte de um CNPJ → lista filtra nos dois casos.
2. **Seleção:** escolher uma empresa → campo mostra "Nome — CNPJ"; regime/atividade/anexo são carregados; aparece a faixa de competências (ou "Nenhuma competência salva ainda").
3. **Nova empresa:** abrir dropdown → "+ Nova empresa" → modal abre; preencher nome e salvar → empresa entra na lista e é **auto-selecionada**.
4. **Editar:** com empresa selecionada, clicar no lápis → modal abre com os dados; alterar e salvar → seleção atualizada.
5. **Competências:** com uma empresa que tenha competências salvas, clicar num chip → mês/ano mudam e a competência reabre (campos preenchidos); "Abrir última" → vai para a mais recente.

Comando de conferência via preview_eval (após selecionar empresa):
```js
(()=>{const chips=[...document.querySelectorAll('.chip')].map(c=>c.textContent);return {placeholderOuNome:document.querySelector('input.pl-9')?.value,chips:chips.slice(0,8)}})()
```
Expected: o input mostra o nome da empresa; os chips de competência aparecem quando há registros.

---

## Self-Review (preenchido)

- **Cobertura da spec:** (1) combobox de busca por nome/CNPJ → Task 3 + Task 4 Step 3; (2) cadastrar/editar sem sair → Task 2 (modal) + Task 4 Steps 1/4 (estado + render) com auto-seleção (Step 2 `onClienteSaved`); (3) competências salvas + "Abrir última" → Task 4 Steps 2/3; refactor `novoCliente` → Task 1; `/clientes` usando o modal compartilhado → Task 2 Step 2. Sem lacunas.
- **Placeholders:** nenhum — todo passo tem código real.
- **Consistência de tipos:** `ClienteModal({ cliente: Cliente, onClose, onSaved })` definido na Task 2 e usado na Task 4; `ClientePicker({ clientes, value, onSelect, onNew, onEdit })` definido na Task 3 e usado na Task 4; `novoCliente(): Cliente` definido na Task 1 e usado nas Tasks 2/4; `abrirComp(compKey)` e `onClienteSaved(c)` definidos e usados na Task 4. `records` é `ApuracaoRecord[]` com `compKey`/`competenceShort`. Coerente.
