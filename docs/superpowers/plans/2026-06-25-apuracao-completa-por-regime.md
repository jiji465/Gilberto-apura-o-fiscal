# Apuração completa por regime (folha e pró-labore) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Gerar automaticamente as guias corretas de cada regime, incluindo encargos de folha e pró-labore — só quando houver folha ou pró-labore — com as incidências certas (RAT/FGTS/Terceiros só na folha; INSS 11% só no pró-labore; CPP patronal só em LP/Anexo IV).

**Architecture:** Centralizar os encargos de folha/pró-labore numa seção única em `computeApuracao` (substituindo a lógica duplicada do Anexo IV e do LP). Novos campos digitados (INSS retido, IRRF da folha, ICMS) viram guias. O relatório já consome `ap.taxes` — sem mudança estrutural nele.

**Tech Stack:** Next.js 15, React 19, TypeScript. Verificação por `pnpm typecheck` + navegador (Claude Preview porta 3212).

## Global Constraints

- Projeto em `C:\Users\Admin\Downloads\GILBERTO`. Sem framework de testes — verificação = `pnpm typecheck` + navegador.
- Monetários string pt-BR; helpers de `lib/format.ts` (`parseBR`, `fmtNum`).
- Incidências (verificadas): pró-labore → INSS 11% (todos) + CPP 20% patronal (LP/Real e Anexo IV); folha → FGTS 8% (todos) + CPP 20% + RAT (LP/Real e Anexo IV) + Terceiros (só LP/Real). Simples não-IV: CPP/RAT no DAS (não gera por fora).
- Geração condicional: folha só se `folhaMensal > 0`; pró-labore só se `proLabore > 0`.
- MEI não tem essa seção.

---

## Task 1: Tipos — campos digitados

**Files:**
- Modify: `lib/types.ts` (interface `ClientData`)

**Interfaces:**
- Produces: `ClientData.inssRetidoFolha?: string`, `ClientData.irrfFolha?: string`, `ClientData.icmsRecolher?: string`. Tasks 2/3 dependem destes nomes.

- [ ] **Step 1: Adicionar campos**

Em `lib/types.ts`, na interface `ClientData`, logo após `terceirosRate?: string`, acrescentar:

```typescript
  terceirosRate?: string
  /** INSS retido dos empregados (GPS) — valor digitado (tabela progressiva). */
  inssRetidoFolha?: string
  /** IRRF retido da folha (DARF) — valor digitado. */
  irrfFolha?: string
  /** ICMS a recolher (Lucro Presumido comércio/indústria) — valor digitado. */
  icmsRecolher?: string
```

- [ ] **Step 2: Verificar tipos**

Run: `cd /c/Users/Admin/Downloads/GILBERTO && pnpm typecheck`
Expected: sem erros.

---

## Task 2: Motor — seção única de folha/pró-labore + ICMS digitado

**Files:**
- Modify: `lib/engine.ts` (mapa de `dueDate`; bloco do Anexo IV no Simples; bloco de folha do Lucro Presumido; nova seção compartilhada)

**Interfaces:**
- Consumes: `ClientData.folhaMensal/proLabore/ratRate/terceirosRate/inssRetidoFolha/irrfFolha/icmsRecolher`, `sn.anexoEf`.
- Produces: `taxes` com guias "FGTS", "CPP (Patronal)", "RAT", "Terceiros", "INSS (Pró-labore)", "INSS (Folha)", "IRRF (Folha)", "ICMS" conforme as regras.

- [ ] **Step 1: Acrescentar vencimentos ao mapa**

Em `lib/engine.ts`, na função `dueDate`, no objeto `map`, acrescentar duas entradas (dia 20):

Localizar:
```typescript
    PIS: 25, COFINS: 25, ISS: 10, "ISS (próprio)": 10, "INSS (Pró-labore)": 20,
    "CPP (Patronal)": 20, RAT: 20, Terceiros: 20, FGTS: 7, DAS: 20, "DAS-MEI": 20, ICMS: 20, IRRF: 20,
```
Trocar por:
```typescript
    PIS: 25, COFINS: 25, ISS: 10, "ISS (próprio)": 10, "INSS (Pró-labore)": 20,
    "CPP (Patronal)": 20, RAT: 20, Terceiros: 20, FGTS: 7, DAS: 20, "DAS-MEI": 20, ICMS: 20, IRRF: 20,
    "INSS (Folha)": 20, "IRRF (Folha)": 20,
```

- [ ] **Step 2: Remover folha do bloco Anexo IV (Simples)**

Localizar (dentro do `if (regime === "Simples Nacional")`):
```typescript
    // Anexo IV: a CPP patronal (20%) é recolhida POR FORA do DAS, sobre a folha + pró-labore
    // (GPS). RAT (GILRAT) também incide; o Simples é isento de Terceiros (Sistema S).
    if (anexoEf === "Anexo IV") {
      const baseFolha = folhaMensal + proLabore
      if (baseFolha > 0) {
        taxes.push({
          tax: "CPP (Patronal)", base: fmtNum(baseFolha), rate: "20,00",
          apurado: fmtNum(baseFolha * 0.2), retido: "", value: fmtNum(baseFolha * 0.2),
          dueDate: dueDate(cd.compMonth, cd.compYear, "CPP (Patronal)"),
          obs: "Anexo IV — CPP patronal recolhida por fora do DAS (GPS)", group: "Folha",
        })
        const ratRate = parseBR(cd.ratRate || "1,00")
        taxes.push({
          tax: "RAT", base: fmtNum(baseFolha), rate: ratRate.toFixed(2).replace(".", ","),
          apurado: fmtNum((baseFolha * ratRate) / 100), retido: "", value: fmtNum((baseFolha * ratRate) / 100),
          dueDate: dueDate(cd.compMonth, cd.compYear, "RAT"),
          obs: "Risco Ambiental do Trabalho (GILRAT)", group: "Folha",
        })
      }
    }

    if (proLabore > 0) {
      taxes.push({
        tax: "INSS (Pró-labore)", base: fmtNum(proLabore), rate: "11,00",
        apurado: fmtNum(proLabore * 0.11), retido: "", value: fmtNum(proLabore * 0.11),
        dueDate: dueDate(cd.compMonth, cd.compYear, "INSS (Pró-labore)"),
        obs: "Retenção previdenciária do segurado sobre o pró-labore", group: "Folha",
      })
    }
```
e **apagar todo esse trecho** (a seção compartilhada do Step 4 passa a cuidar disso). Manter o restante do bloco do Simples (DAS, repartição) intacto.

- [ ] **Step 3: Remover folha do bloco Lucro Presumido**

Localizar (dentro do `if (regime === "Lucro Presumido" || regime === "Lucro Real")`, ao final):
```typescript
    const baseFolha = folhaMensal + proLabore
    if (baseFolha > 0) {
      pushLP("CPP (Patronal)", baseFolha, 20.0, baseFolha * 0.2, "Contribuição previdenciária patronal", "Folha", "CPP (Patronal)")
      const ratRate = parseBR(cd.ratRate || "1,00")
      pushLP("RAT", baseFolha, ratRate, (baseFolha * ratRate) / 100, "Risco Ambiental do Trabalho", "Folha", "RAT")
      const terRate = parseBR(cd.terceirosRate || "5,80")
      pushLP("Terceiros", baseFolha, terRate, (baseFolha * terRate) / 100, "Sistema S (SESC, SENAC, SEBRAE...)", "Folha", "Terceiros")
    }
    if (folhaMensal > 0) pushLP("FGTS", folhaMensal, 8.0, folhaMensal * 0.08, "Fundo de Garantia (8% sobre a folha)", "Folha", "FGTS")
    if (proLabore > 0) pushLP("INSS (Pró-labore)", proLabore, 11.0, proLabore * 0.11, "Retenção do segurado sobre pró-labore", "Folha", "INSS (Pró-labore)")
```
e **apagar todo esse trecho**. Manter PIS/COFINS/ISS/IRPJ/CSLL.

- [ ] **Step 4: Adicionar a seção compartilhada (folha/pró-labore + ICMS)**

Localizar o início da seção de retenções:
```typescript
  // ---------- RETENÇÕES NA FONTE ----------
```
e **inserir, imediatamente ANTES dela**, o bloco:

```typescript
  // ---------- ENCARGOS DE FOLHA E PRÓ-LABORE (exceto MEI) ----------
  if (regime !== "MEI") {
    const patronalAplica =
      regime === "Lucro Presumido" || regime === "Lucro Real" ||
      (regime === "Simples Nacional" && sn?.anexoEf === "Anexo IV")
    const pushFolha = (tax: string, base: number, rate: number, valor: number, obs: string) => {
      taxes.push({
        tax, base: fmtNum(base), rate: rate.toFixed(2).replace(".", ","),
        apurado: fmtNum(valor), retido: "", value: fmtNum(valor),
        dueDate: dueDate(cd.compMonth, cd.compYear, tax), obs, group: "Folha",
      })
    }
    // FOLHA DE EMPREGADOS — só se houver folha
    if (folhaMensal > 0) {
      pushFolha("FGTS", folhaMensal, 8.0, folhaMensal * 0.08, "Fundo de Garantia (8% sobre a folha)")
      if (patronalAplica) {
        const ratRate = parseBR(cd.ratRate || "1,00")
        pushFolha("RAT", folhaMensal, ratRate, (folhaMensal * ratRate) / 100, "Risco Ambiental do Trabalho (sobre a folha)")
      }
      if (regime === "Lucro Presumido" || regime === "Lucro Real") {
        const terRate = parseBR(cd.terceirosRate || "5,80")
        pushFolha("Terceiros", folhaMensal, terRate, (folhaMensal * terRate) / 100, "Sistema S (sobre a folha)")
      }
    }
    // CPP PATRONAL (folha + pró-labore) — só onde aplica
    const baseCpp = folhaMensal + proLabore
    if (patronalAplica && baseCpp > 0) {
      pushFolha("CPP (Patronal)", baseCpp, 20.0, baseCpp * 0.2, "Contribuição previdenciária patronal (folha + pró-labore)")
    }
    // PRÓ-LABORE — só se houver pró-labore
    if (proLabore > 0) {
      pushFolha("INSS (Pró-labore)", proLabore, 11.0, proLabore * 0.11, "Retenção previdenciária do sócio (11%)")
    }
    // DIGITADOS (vêm da folha do escritório)
    const inssRet = parseBR(cd.inssRetidoFolha)
    if (inssRet > 0)
      taxes.push({ tax: "INSS (Folha)", base: "", rate: "", apurado: fmtNum(inssRet), retido: "", value: fmtNum(inssRet), dueDate: dueDate(cd.compMonth, cd.compYear, "INSS (Folha)"), obs: "INSS retido dos empregados (GPS)", group: "Folha" })
    const irrf = parseBR(cd.irrfFolha)
    if (irrf > 0)
      taxes.push({ tax: "IRRF (Folha)", base: "", rate: "", apurado: fmtNum(irrf), retido: "", value: fmtNum(irrf), dueDate: dueDate(cd.compMonth, cd.compYear, "IRRF (Folha)"), obs: "IRRF retido da folha (DARF)", group: "Folha" })
  }
  // ICMS digitado (Lucro Presumido comércio/indústria)
  if ((regime === "Lucro Presumido" || regime === "Lucro Real") && atividade !== "Serviços") {
    const icms = parseBR(cd.icmsRecolher)
    if (icms > 0)
      taxes.push({ tax: "ICMS", base: "", rate: "", apurado: fmtNum(icms), retido: "", value: fmtNum(icms), dueDate: dueDate(cd.compMonth, cd.compYear, "ICMS"), obs: "ICMS a recolher (apuração própria)", group: "ICMS" })
  }

```

- [ ] **Step 5: Verificar tipos**

Run: `cd /c/Users/Admin/Downloads/GILBERTO && pnpm typecheck`
Expected: sem erros.

---

## Task 3: Formulário — campos de folha e digitados + verificação

**Files:**
- Modify: `app/relatorio/page.tsx` (card "Dados do mês")

**Interfaces:**
- Consumes: `ClientData.folhaMensal/inssRetidoFolha/irrfFolha/icmsRecolher`, handler `upd`.

- [ ] **Step 1: Folha mensal para todos os não-MEI**

No card "Dados do mês", localizar as duas linhas de folha:
```tsx
              {isSN && cd.anexo === "Anexo IV" && <div><label className="label">Folha do mês (CPP por fora)</label><Money value={cd.folhaMensal} onChange={(v) => upd("folhaMensal", v)} /></div>}
              {isLP && <div><label className="label">Folha de salários do mês (R$)</label><Money value={cd.folhaMensal} onChange={(v) => upd("folhaMensal", v)} /></div>}
```
e substituir por uma única linha (vale p/ qualquer não-MEI):
```tsx
              {!isMEI && <div><label className="label">Folha de salários do mês (R$)</label><Money value={cd.folhaMensal} onChange={(v) => upd("folhaMensal", v)} /></div>}
```

- [ ] **Step 2: Campos digitados (INSS retido, IRRF, ICMS)**

Localizar a linha do pró-labore:
```tsx
              {!isMEI && <div><label className="label">Pró-labore do mês (R$)</label><Money value={cd.proLabore} onChange={(v) => upd("proLabore", v)} /></div>}
```
e logo APÓS ela (ainda dentro do mesmo `<div className="grid ...">`), inserir:
```tsx
              {!isMEI && <div><label className="label">INSS retido dos empregados (R$)</label><Money value={cd.inssRetidoFolha} onChange={(v) => upd("inssRetidoFolha", v)} /></div>}
              {!isMEI && <div><label className="label">IRRF retido da folha (R$)</label><Money value={cd.irrfFolha} onChange={(v) => upd("irrfFolha", v)} /></div>}
              {isLP && cd.atividade !== "Serviços" && <div><label className="label">ICMS a recolher (R$)</label><Money value={cd.icmsRecolher} onChange={(v) => upd("icmsRecolher", v)} /></div>}
```

- [ ] **Step 3: Verificar tipos**

Run: `cd /c/Users/Admin/Downloads/GILBERTO && pnpm typecheck`
Expected: sem erros.

- [ ] **Step 4: Verificação no navegador (end-to-end)**

Servidor preview "gn" na porta 3212. Em `/relatorio`:

1. **Simples não-IV (Anexo III), folha 10.000, pró-labore 5.000, INSS retido 800, IRRF 200** (preencher faturamento/RBT12 quaisquer):
   - guias esperadas: DAS, **FGTS 800,00**, **INSS (Pró-labore) 550,00**, **INSS (Folha) 800,00**, **IRRF (Folha) 200,00**.
   - **NÃO** deve haver CPP/RAT/Terceiros (estão no DAS).
2. **Mudar para Anexo IV** (mesmos valores): além das acima, **CPP (Patronal) 3.000,00** (20% de 15.000) e **RAT** (1% de 10.000 = 100,00). **Sem** Terceiros.
3. **Lucro Presumido, atividade Comércio, folha 10.000, pró-labore 5.000, ICMS 1.500:** PIS, COFINS, IRPJ, CSLL, **FGTS 800**, **CPP 3.000**, **RAT 100**, **Terceiros (5,8% de 10.000 = 580)**, **INSS (Pró-labore) 550**, **ICMS 1.500**.
4. **Zerar folha e pró-labore:** nenhuma guia de folha/pró-labore aparece.

Leitura rápida via preview_eval (aba Visualizar → composição/legenda lista as guias):
```js
(()=>{const o=document.getElementById('rep-overlay');return [...o.querySelectorAll('.leg-i')].map(l=>l.textContent.replace(/\s+/g,' ').trim())})()
```
Expected (cenário 1): inclui "FGTS 800", "INSS (Pró-labore) 550", "INSS (Folha) 800", "IRRF (Folha) 200" e NÃO inclui "RAT"/"Terceiros".

---

## Self-Review (preenchido)

- **Cobertura da spec:** campos digitados → Task 1; mapa de vencimentos + seção única + ICMS → Task 2; folha p/ todos + inputs no formulário → Task 3; incidências e geração condicional → Task 2 Step 4; verificação → Task 3 Step 4. Sem lacunas.
- **Placeholders:** nenhum — código real em cada passo.
- **Consistência de tipos:** nomes de guias usados na verificação ("FGTS", "CPP (Patronal)", "RAT", "Terceiros", "INSS (Pró-labore)", "INSS (Folha)", "IRRF (Folha)", "ICMS") batem com os criados na Task 2; campos `inssRetidoFolha/irrfFolha/icmsRecolher` definidos na Task 1 e usados nas Tasks 2/3. `patronalAplica` usa `sn?.anexoEf` (sn já calculado no bloco do Simples). Coerente.
