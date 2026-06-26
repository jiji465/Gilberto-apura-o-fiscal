"use client"

import { useEffect, useMemo, useState } from "react"
import { FileText, Calculator, Upload, Sparkles, Trash2, Download, Printer, Scale, Plus, ListPlus } from "lucide-react"
import { computeApuracao, calcEconomia, MEI_CATEGORIAS, MEI_DAS_2026 } from "@/lib/engine"
import { fmtBRL, fmtNum, fmtCNPJ, fmtPct, maskBRL, parseBR, MONTHS } from "@/lib/format"
import { parsePGDAS } from "@/lib/pgdas"
import { lerTextoPGDAS, exportRelatorioPDF, safeFilename } from "@/lib/pdf"
import { uid, getParametros } from "@/lib/storage"
import { PARAMETROS_PADRAO, type ParametrosFiscais } from "@/lib/config"
import { toastSuccess, toastError, toastInfo, toastWarning } from "@/lib/toast"
import { RelatorioMensal } from "@/components/RelatorioMensal"
import type { Anexo, Atividade, ClientData, ExtraTax, Regime } from "@/lib/types"

const ITEM_GRUPOS = ["DAS", "Folha", "PIS/COFINS", "IRPJ/CSLL", "ISS", "ICMS", "Parcelamento", "Outros"]
const isoToBR = (s: string) => { const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : s }
const brToISO = (s?: string) => { const m = (s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : "" }

const REGIMES: Regime[] = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI"]
const ATIVIDADES: Atividade[] = ["Serviços", "Comércio", "Indústria"]
const ANEXOS: Anexo[] = ["Anexo I", "Anexo II", "Anexo III", "Anexo IV", "Anexo V"]
const YEARS = [2024, 2025, 2026, 2027, 2028]

// Coerência Simples: cada anexo implica uma atividade (e vice-versa, com padrão).
const ATIV_DO_ANEXO: Record<string, Atividade> = { "Anexo I": "Comércio", "Anexo II": "Indústria", "Anexo III": "Serviços", "Anexo IV": "Serviços", "Anexo V": "Serviços" }
const ANEXO_DA_ATIV: Record<string, Anexo> = { "Comércio": "Anexo I", "Indústria": "Anexo II", "Serviços": "Anexo III" }

function blank(): ClientData {
  return { regime: "Simples Nacional", atividade: "Serviços", anexo: "Anexo III", compYear: String(new Date().getFullYear()), ret: {}, extraTaxes: [] }
}

function Money({ value, onChange, placeholder = "0,00" }: { value?: string; onChange: (v: string) => void; placeholder?: string }) {
  // Colar aceita "R$ 1.234,56", "1234,56", "1.234,56" etc. → normaliza para pt-BR.
  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const t = e.clipboardData.getData("text")
    if (!t) return
    e.preventDefault()
    onChange(fmtNum(parseBR(t.replace(/[^\d.,]/g, ""))))
  }
  return <input className="input" inputMode="decimal" value={value || ""} onChange={(e) => onChange(maskBRL(e.target.value))} onPaste={onPaste} placeholder={placeholder} />
}

// Campo de data em texto (DD/MM/AAAA) — aceita digitar e colar (type=date não permite colar).
function DateBR({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const mask = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 8)
    if (d.length <= 2) return d
    if (d.length <= 4) return d.slice(0, 2) + "/" + d.slice(2)
    return d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4)
  }
  return <input className="input" inputMode="numeric" value={value || ""} onChange={(e) => onChange(mask(e.target.value))} placeholder="DD/MM/AAAA" />
}

export default function RelatorioPage() {
  const [cd, setCd] = useState<ClientData>(blank())
  const [pgdasText, setPgdasText] = useState("")
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [tab, setTab] = useState<"editar" | "visualizar">("editar")
  const [params, setParams] = useState<ParametrosFiscais>(PARAMETROS_PADRAO)

  useEffect(() => {
    const pr = getParametros()
    setParams(pr)
    setCd((p) => (p.issRate ? p : { ...p, issRate: String(pr.issPadrao).replace(".", ",") }))
  }, [])

  const isSN = cd.regime === "Simples Nacional"
  const isLP = cd.regime === "Lucro Presumido" || cd.regime === "Lucro Real"
  const isMEI = cd.regime === "MEI"

  const upd = (k: keyof ClientData, v: any) =>
    setCd((p) => {
      const next = { ...p, [k]: v }
      if (["revenue", "rbt12", "anexo", "atividade", "regime"].includes(k as string)) delete next.repartManual
      if (["anexo", "atividade", "regime"].includes(k as string)) delete next.overrides
      // No Simples, mantém Atividade e Anexo coerentes (anexo é a fonte autoritativa).
      if (next.regime === "Simples Nacional") {
        if (k === "anexo" && next.anexo) next.atividade = ATIV_DO_ANEXO[next.anexo] || next.atividade
        if (k === "atividade" && ATIV_DO_ANEXO[next.anexo || ""] !== next.atividade) next.anexo = ANEXO_DA_ATIV[next.atividade] || next.anexo
      }
      return next
    })
  const updRet = (tax: string, v: string) => setCd((p) => ({ ...p, ret: { ...(p.ret || {}), [tax]: v } }))
  const updRepart = (tax: string, v: string) => setCd((p) => ({ ...p, repartManual: { ...(p.repartManual || {}), [tax]: v } }))
  const setMeiCategoria = (cat: string) => setCd((p) => ({ ...p, meiCategoria: cat, meiDasFixo: fmtNum(MEI_DAS_2026[cat]?.das ?? 0) }))
  // itens/guias extras (manuais) — entram nos vencimentos, composição e total
  const addItem = () => setCd((p) => ({ ...p, extraTaxes: [...(p.extraTaxes || []), { id: uid(), tax: "", value: "", group: "Outros" }] }))
  const updItem = (id: string | number, field: keyof ExtraTax, v: any) =>
    setCd((p) => ({ ...p, extraTaxes: (p.extraTaxes || []).map((e) => (e.id === id ? { ...e, [field]: v } : e)) }))
  const delItem = (id: string | number) => setCd((p) => ({ ...p, extraTaxes: (p.extraTaxes || []).filter((e) => e.id !== id) }))
  const setOverride = (tax: string, field: "value" | "dueDate", v: string) =>
    setCd((p) => ({ ...p, overrides: { ...(p.overrides || {}), [tax]: { ...(p.overrides?.[tax] || {}), [field]: v } } }))
  const recalcular = () => setCd((p) => { const n = { ...p }; delete n.overrides; return n })

  const ap = useMemo(() => computeApuracao(cd, params), [cd, params])

  function applyPgdas(raw: string): boolean {
    const res = parsePGDAS(raw)
    if (!res) { toastError("Não consegui identificar. Anexe a Declaração ou o Extrato do PGDAS-D."); return false }
    const f = res.fields
    const comp = f.compMonth && f.compYear ? String(f.compMonth).padStart(2, "0") + "/" + f.compYear : cd.competenceShort
    setCd((p) => ({
      ...p,
      regime: "Simples Nacional",
      clientName: f.clientName || p.clientName,
      cnpj: f.cnpj ? fmtCNPJ(f.cnpj) : p.cnpj,
      compMonth: f.compMonth || p.compMonth,
      compYear: f.compYear || p.compYear,
      competenceShort: comp,
      atividade: (f.atividade as Atividade) || p.atividade || "Serviços",
      anexo: (f.anexo as Anexo) || p.anexo || "Anexo III",
      revenue: f.revenue || p.revenue,
      rbt12: f.rbt12 || p.rbt12,
      folha12m: f.folha12m || p.folha12m,
      repartManual: res.repart,
      dasOfficial: f.dasOfficial || "",
      segIcmsST: res.seg?.icmsST || 0,
      segIcmsNormal: res.seg?.icmsNormal || 0,
      segPisCofinsMono: res.seg?.pisCofinsMonofasico || 0,
    }))
    toastSuccess(`Identificado: ${f.clientName || "empresa"} • ${comp || ""} • DAS ${f.dasOfficial ? "R$ " + f.dasOfficial : ""}`)
    const seg = res.seg
    if (seg && (seg.icmsST > 0 || seg.pisCofinsMonofasico > 0)) {
      const parts: string[] = []
      if (seg.icmsNormal > 0 || seg.icmsST > 0) parts.push(`ICMS normal ${fmtBRL(seg.icmsNormal)} · ICMS-ST ${fmtBRL(seg.icmsST)}`)
      if (seg.pisCofinsMonofasico > 0) parts.push(`PIS/COFINS monofásico ${fmtBRL(seg.pisCofinsMonofasico)}`)
      toastInfo(`Segregação: ${parts.join(" • ")}`)
    }
    res.warnings?.forEach((w) => toastWarning(w))
    return true
  }

  async function readPdf(file?: File | null) {
    if (!file) return
    setBusy(true)
    try {
      const txt = await lerTextoPGDAS(file)
      if (txt.replace(/\s/g, "").length < 30) toastError("PDF sem texto selecionável (digitalizado). Cole o texto manualmente.")
      else applyPgdas(txt)
    } catch (e) {
      console.error(e)
      toastError("Não consegui ler o PDF. Tente colar o texto.")
    }
    setBusy(false)
  }

  function compFile() {
    return (cd.compMonth ? String(cd.compMonth).padStart(2, "0") : "") + (cd.compYear ? "-" + cd.compYear : "")
  }
  async function baixarPdf() {
    setExporting(true)
    try {
      await exportRelatorioPDF(safeFilename(`Relatorio Fiscal - ${cd.clientName || "Empresa"}${compFile() ? " - " + compFile() : ""}`))
    } catch (e) { console.error(e); toastError((e instanceof Error && e.message ? e.message + " " : "") + "Não consegui gerar o PDF. Use 'Imprimir / PDF'.") }
    setExporting(false)
  }
  const retEligible = ap.taxes.filter((t) => !t.manual && ["IRPJ", "CSLL", "PIS", "COFINS", "ISS", "DAS"].includes(t.tax))
  const dasOk = cd.dasOfficial && ap.sn ? Math.abs(ap.sn.das - parseBR(cd.dasOfficial)) <= 0.05 : false

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-start justify-between gap-3 mb-6 no-print">
        <div>
          <h1 className="font-serif text-2xl text-[var(--navy)]">Relatório Mensal</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Importe o PGDAS-D (Simples) ou informe os dados (Lucro Presumido/Real, MEI) e gere o relatório para baixar ou imprimir.</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {tab === "visualizar" && <button className="btn btn-outline" disabled={exporting} onClick={baixarPdf}><Download className="h-4 w-4" /> {exporting ? "Gerando…" : "Baixar PDF"}</button>}
          {tab === "visualizar" && <button className="btn btn-gold" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir / PDF</button>}
        </div>
      </div>

      <div className="flex gap-1 mb-5 no-print">
        <button className={"btn " + (tab === "editar" ? "btn-primary" : "btn-outline")} onClick={() => setTab("editar")}><FileText className="h-4 w-4" /> Editar</button>
        <button className={"btn " + (tab === "visualizar" ? "btn-primary" : "btn-outline")} onClick={() => setTab("visualizar")}><Calculator className="h-4 w-4" /> Visualizar</button>
      </div>

      {tab === "editar" ? (
        <div className="space-y-5 no-print max-w-5xl">
          {/* Empresa & competência */}
          <div className="card p-5">
            <h2 className="font-semibold mb-4">Empresa &amp; competência</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="label">Razão social / Nome</label>
                <input className="input" value={cd.clientName || ""} onChange={(e) => upd("clientName", e.target.value)} placeholder="Empresa do cliente" />
              </div>
              <div className="md:col-span-2">
                <label className="label">CNPJ</label>
                <input className="input" value={cd.cnpj || ""} onChange={(e) => upd("cnpj", fmtCNPJ(e.target.value))} placeholder="00.000.000/0000-00" />
              </div>
              <div>
                <label className="label">Mês</label>
                <select className="input" value={cd.compMonth || ""} onChange={(e) => { upd("compMonth", e.target.value); upd("competenceShort", e.target.value.padStart(2, "0") + "/" + (cd.compYear || "")) }}>
                  <option value="">Mês</option>
                  {MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Ano</label>
                <select className="input" value={cd.compYear || ""} onChange={(e) => upd("compYear", e.target.value)}>
                  {YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Regime</label>
                <select className="input" value={cd.regime} onChange={(e) => upd("regime", e.target.value)}>
                  {REGIMES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Atividade</label>
                <select className="input" value={cd.atividade} onChange={(e) => upd("atividade", e.target.value)}>
                  {ATIVIDADES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              {isSN && (
                <div>
                  <label className="label">Anexo</label>
                  <select className="input" value={cd.anexo || ""} onChange={(e) => upd("anexo", e.target.value)}>
                    {ANEXOS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Importar PGDAS-D */}
          {isSN && (
            <div className="card p-5">
              <h2 className="font-semibold mb-1 flex items-center gap-2"><Upload className="h-4 w-4" /> Importar PGDAS-D <span className="chip bg-[#fbeed4] text-[var(--gold-deep,#a86c12)]">identifica sozinho</span></h2>
              <p className="text-xs text-[var(--muted)] mb-3">Anexe o PDF ou cole o texto — preenche tudo automaticamente.</p>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <label className="btn btn-outline cursor-pointer">
                  <Upload className="h-4 w-4" /> {busy ? "Lendo PDF…" : "Anexar PDF"}
                  <input type="file" accept="application/pdf" className="hidden" onChange={(e) => readPdf(e.target.files?.[0])} />
                </label>
                {dasOk && <span className="text-xs font-semibold text-emerald-600">✓ DAS calculado {fmtBRL(ap.sn!.das)} confere com o PGDAS</span>}
                {cd.dasOfficial && !dasOk && <span className="text-xs font-semibold text-amber-600">DAS difere do extrato ({fmtBRL(cd.dasOfficial)})</span>}
              </div>
              <textarea className="input font-mono text-xs min-h-[70px]" value={pgdasText} onChange={(e) => setPgdasText(e.target.value)} placeholder="…ou cole aqui o texto do PGDAS-D" />
              <button className="btn btn-primary mt-2 text-sm" onClick={() => { if (applyPgdas(pgdasText)) setPgdasText("") }}><Sparkles className="h-4 w-4" /> Preencher</button>
            </div>
          )}

          {/* MEI */}
          {isMEI && (
            <div className="card p-5">
              <h2 className="font-semibold mb-1">MEI — DAS fixo <span className="chip bg-[#fbeed4] text-[#a86c12]">SIMEI</span></h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="label">Categoria</label>
                  <select className="input" value={cd.meiCategoria || ""} onChange={(e) => setMeiCategoria(e.target.value)}>
                    <option value="">Selecione…</option>
                    {MEI_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className="label">DAS-MEI do mês (R$)</label><Money value={cd.meiDasFixo} onChange={(v) => upd("meiDasFixo", v)} /></div>
              </div>
            </div>
          )}

          {/* Dados do mês */}
          <div className="card p-5">
            <h2 className="font-semibold mb-4 flex items-center gap-2"><Calculator className="h-4 w-4" /> Dados do mês</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="label">Faturamento do mês (R$)</label><Money value={cd.revenue} onChange={(v) => upd("revenue", v)} /></div>
              {isSN && <div><label className="label">RBT12 (R$)</label><Money value={cd.rbt12} onChange={(v) => upd("rbt12", v)} /></div>}
              {isSN && (cd.anexo === "Anexo III" || cd.anexo === "Anexo V") && <div><label className="label">Folha + Pró-labore 12m (Fator R)</label><Money value={cd.folha12m} onChange={(v) => upd("folha12m", v)} /></div>}
              {!isMEI && <div><label className="label">Folha de salários do mês (R$)</label><Money value={cd.folhaMensal} onChange={(v) => upd("folhaMensal", v)} /></div>}
              {!isMEI && cd.atividade === "Serviços" && (
                <div>
                  <label className="label">Alíquota ISS (%){isSN ? " — comparação L. Presumido" : ""}</label>
                  <input className="input" value={cd.issRate ?? ""} onChange={(e) => upd("issRate", e.target.value)} placeholder={String(params.issPadrao).replace(".", ",")} />
                </div>
              )}
              {!isMEI && <div><label className="label">Pró-labore do mês (R$)</label><Money value={cd.proLabore} onChange={(v) => upd("proLabore", v)} /></div>}
              {!isMEI && parseBR(cd.proLabore) > 0 && <div><label className="label">Dependentes (IRRF)</label><input className="input" inputMode="numeric" value={cd.proLaboreDeps || ""} onChange={(e) => upd("proLaboreDeps", e.target.value.replace(/\D/g, ""))} placeholder="0" /></div>}
              {!isMEI && <div><label className="label">INSS retido dos empregados (R$)</label><Money value={cd.inssRetidoFolha} onChange={(v) => upd("inssRetidoFolha", v)} /></div>}
              {!isMEI && <div><label className="label">IRRF retido da folha (R$)</label><Money value={cd.irrfFolha} onChange={(v) => upd("irrfFolha", v)} /></div>}
              {isLP && cd.atividade !== "Serviços" && <div><label className="label">ICMS a recolher (R$)</label><Money value={cd.icmsRecolher} onChange={(v) => upd("icmsRecolher", v)} /></div>}
            </div>
            {isLP && cd.atividade === "Serviços" && (
              <label className="mt-4 flex items-center gap-3 rounded-lg border border-[var(--line)] p-3 cursor-pointer bg-emerald-50/60">
                <input type="checkbox" checked={!!cd.equipHospitalar} onChange={(e) => upd("equipHospitalar", e.target.checked)} />
                <span className="text-xs"><b>Equiparação hospitalar</b> — presunção 8%/12% em vez de 32%. O relatório mostra a economia.</span>
              </label>
            )}
          </div>

          {/* Fator R ao vivo */}
          {isSN && ap.sn && (cd.anexo === "Anexo III" || cd.anexo === "Anexo V") && ap.sn.rbt12 > 0 && (
            <div className={"card p-5 " + (ap.sn.fatorR >= 28 ? "border-emerald-300" : "border-amber-300")}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Scale className="h-4 w-4" /> Análise do Fator R</h3>
                <span className={"chip text-white " + (ap.sn.fatorR >= 28 ? "bg-emerald-600" : "bg-amber-500")}>{ap.sn.fatorR >= 28 ? "Anexo III aplicado" : "Anexo V aplicado"}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border border-[var(--line)] p-3"><p className="text-[10px] uppercase text-[var(--muted)] font-bold">Fator R</p><p className={"text-xl font-bold " + (ap.sn.fatorR >= 28 ? "text-emerald-600" : "text-amber-600")}>{ap.sn.fatorR.toFixed(2).replace(".", ",")}%</p></div>
                <div className="rounded-lg border border-[var(--line)] p-3"><p className="text-[10px] uppercase text-[var(--muted)] font-bold">Alíquota efetiva</p><p className="text-xl font-bold">{ap.sn.rate.toFixed(2).replace(".", ",")}%</p></div>
                <div className="rounded-lg border border-[var(--line)] p-3"><p className="text-[10px] uppercase text-[var(--muted)] font-bold">DAS do mês</p><p className="text-xl font-bold">{fmtBRL(ap.sn.das)}</p></div>
              </div>
            </div>
          )}

          {/* Impostos a recolher — grade editável (calculados + manuais) */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2"><Scale className="h-4 w-4" /> Impostos a recolher</h2>
              <div className="flex gap-2">
                <button className="btn btn-outline text-xs px-2 py-1" onClick={recalcular} title="Voltar aos valores calculados">Recalcular</button>
                <button className="btn btn-outline text-xs px-2 py-1" onClick={addItem}><Plus className="h-3.5 w-3.5" /> Adicionar guia</button>
              </div>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] uppercase font-semibold text-[var(--muted)] px-1 mb-1">
              <div className="col-span-5">Tributo</div><div className="col-span-3">Valor (R$)</div><div className="col-span-3">Vencimento</div><div className="col-span-1"></div>
            </div>
            <div className="space-y-2">
              {/* calculadas pelo motor (valor/vencimento editáveis via override) */}
              {ap.taxes.filter((t) => !t.manual).map((t, i) => (
                <div key={t.tax || i} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center">
                  <div className="col-span-2 md:col-span-5"><div className="px-1 text-sm font-medium text-[var(--ink)]">{t.tax}<span className="text-[10px] text-[var(--muted)] ml-2 uppercase tracking-wide">{t.group}</span></div></div>
                  <div className="md:col-span-3"><Money value={cd.overrides?.[t.tax]?.value ?? t.value} onChange={(v) => setOverride(t.tax, "value", v)} /></div>
                  <div className="md:col-span-3"><DateBR value={cd.overrides?.[t.tax]?.dueDate ?? t.dueDate} onChange={(v) => setOverride(t.tax, "dueDate", v)} /></div>
                  <div className="md:col-span-1" />
                </div>
              ))}
              {/* guias manuais (vêm de extraTaxes; aparecem mesmo em branco para edição) */}
              {(cd.extraTaxes || []).map((e) => (
                <div key={e.id} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center">
                  <div className="col-span-2 md:col-span-5"><input className="input" value={e.tax} onChange={(ev) => updItem(e.id!, "tax", ev.target.value)} placeholder="Nome da guia (ex.: DARF IRRF)" /></div>
                  <div className="md:col-span-3"><Money value={e.value} onChange={(v) => updItem(e.id!, "value", v)} /></div>
                  <div className="md:col-span-3"><DateBR value={e.dueDate} onChange={(v) => updItem(e.id!, "dueDate", v)} /></div>
                  <div className="md:col-span-1"><button className="btn btn-outline px-2 py-2 text-red-600 w-full" onClick={() => delItem(e.id!)} aria-label="Remover"><Trash2 className="h-3.5 w-3.5" /></button></div>
                </div>
              ))}
              {ap.taxes.filter((t) => !t.manual).length === 0 && (cd.extraTaxes || []).length === 0 && <div className="text-sm text-[var(--muted)] px-1">Informe o faturamento (ou importe o PGDAS-D) para calcular os impostos, ou clique em “Adicionar guia”.</div>}
            </div>
          </div>

          {/* Retenções */}
          {retEligible.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold mb-1">Retenções na fonte (opcional)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {retEligible.map((t) => <div key={t.tax}><label className="label">{t.tax} retido</label><Money value={(cd.ret || {})[t.tax]} onChange={(v) => updRet(t.tax, v)} /></div>)}
              </div>
            </div>
          )}

          {/* Opcionais do relatório */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold mb-3">Quadros opcionais do relatório</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="label">Nº de notas emitidas (ticket médio)</label><input className="input" inputMode="numeric" value={cd.numNotas || ""} onChange={(e) => upd("numNotas", e.target.value.replace(/\D/g, ""))} placeholder="ex.: 312" /></div>
            </div>
            <div className="mt-4">
              <label className="label">Observações &amp; recomendações <span className="text-[var(--muted)] font-normal">(aparecem como seção no relatório)</span></label>
              <textarea className="input min-h-[90px]" value={cd.observacoes || ""} onChange={(e) => upd("observacoes", e.target.value)} placeholder="Ex.: Lembrar o cliente do reajuste do pró-labore; conferir notas em atraso; etc." />
            </div>
          </div>

        </div>
      ) : (
        ap.revenue > 0 ? (
          <div className="overflow-auto">
            <RelatorioMensal cd={cd} ap={ap} evolution={[]} params={params} />
          </div>
        ) : (
          <div className="card p-10 text-center text-sm text-[var(--muted)] no-print">Selecione a empresa, a competência e informe o faturamento (ou importe o PGDAS-D) para ver o relatório.</div>
        )
      )}
    </div>
  )
}
