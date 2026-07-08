"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { FileText, Calculator, Upload, Sparkles, Trash2, Download, Printer, Scale, Plus, ListPlus, ChevronDown } from "lucide-react"
import { computeApuracao, calcEconomia, simularComparativo, MEI_CATEGORIAS, MEI_DAS_2026 } from "@/lib/engine"
import { fmtBRL, fmtNum, fmtCNPJ, fmtPct, maskBRL, parseBR, MONTHS } from "@/lib/format"
import { parsePGDAS } from "@/lib/pgdas"
import { lerTextoPGDAS, exportRelatorioPDF, safeFilename } from "@/lib/pdf"
import { uid, getParametros, getDraft, saveDraft, clearDraft } from "@/lib/storage"
import { PARAMETROS_PADRAO, type ParametrosFiscais } from "@/lib/config"
import { toastSuccess, toastError, toastInfo, toastWarning } from "@/lib/toast"
import { RelatorioMensal } from "@/components/RelatorioMensal"
import type { Anexo, Apuracao, Atividade, AtividadeLinha, ClientData, ExtraTax, Pendencia, Regime } from "@/lib/types"

const ITEM_GRUPOS = ["DAS", "Folha", "PIS/COFINS", "IRPJ/CSLL", "ISS", "ICMS", "Parcelamento", "Outros"]
const isoToBR = (s: string) => { const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : s }
const brToISO = (s?: string) => { const m = (s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : "" }
// Máscara de competência MM/AAAA (digitar e colar).
const maskComp = (raw: string) => { const d = raw.replace(/\D/g, "").slice(0, 6); return d.length <= 2 ? d : d.slice(0, 2) + "/" + d.slice(2) }
// Reconhece competência em VÁRIOS formatos → normaliza p/ "MM/AAAA". Cobre:
// 02/2025 · 02/25 · 11-2024 · 2025-02 · nov/20 · nov/2020 · novembro/2020 · nov-20 · "nov 2020".
const MESES_PT: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 }
const y4 = (s: string) => (s.length === 2 ? 2000 + parseInt(s, 10) : parseInt(s, 10))
function parseCompetencia(raw: string): string {
  const s = raw.trim().toLowerCase()
  let m = s.match(/^([a-zç]{3,9})[.\/\-\s]+(\d{2,4})$/) // mês por extenso/abrev + ano
  if (m) { const mes = MESES_PT[m[1].slice(0, 3)]; if (mes) return `${String(mes).padStart(2, "0")}/${y4(m[2])}` }
  m = s.match(/^(\d{1,2})[.\/\-](\d{2,4})$/) // MM/AAAA ou MM/AA
  if (m) { const mes = parseInt(m[1], 10); if (mes >= 1 && mes <= 12) return `${String(mes).padStart(2, "0")}/${y4(m[2])}` }
  m = s.match(/^(\d{4})[.\/\-](\d{1,2})$/) // AAAA-MM (ISO)
  if (m) { const mes = parseInt(m[2], 10); if (mes >= 1 && mes <= 12) return `${String(mes).padStart(2, "0")}/${m[1]}` }
  return ""
}

// Classifica uma linha colada (de planilha/Excel) detectando o separador
// (TAB → ';' → 2+ espaços) e o TIPO de cada célula (data, parcela X/Y, valor, texto).
// Independente da ordem das colunas — "adaptável".
function classificarColado(line: string, modo: "parcela" | "pendencia" | "auto" = "auto") {
  let cells = line.includes("\t") ? line.split("\t") : line.includes(";") ? line.split(";") : line.split(/\s{2,}/)
  cells = cells.map((c) => c.trim()).filter(Boolean)
  if (cells.length === 1) cells = line.trim().split(/\s+/) // fallback: espaço simples
  const out = { descricao: "", valor: "", vencimento: "", competencia: "", parcelaNum: "", parcelaTot: "", situacao: "" }
  const desc: string[] = []
  const isMoney = (s: string) => /\d/.test(s) && /^r?\$?\s*\d{1,3}(\.\d{3})*(,\d{1,2})?$|^r?\$?\s*\d+([.,]\d{1,2})?$/i.test(s.trim())
  const normData = (s: string) => { const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (!m) return s; const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${y}` }
  for (const c of cells) {
    // Em pendência, qualquer formato de competência (incl. "nov/20") vence a leitura.
    const comp = modo !== "parcela" ? parseCompetencia(c) : ""
    if (comp) out.competencia = comp
    else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(c)) out.vencimento = normData(c)
    else if (modo !== "pendencia" && /^\d+\s*\/\s*\d+$/.test(c)) { const [a, b] = c.split("/"); out.parcelaNum = a.trim(); out.parcelaTot = b.trim() }
    else if (/(vencid|cobran|d[ií]vida ativa|atraso|protesto|em aberto|suspens)/i.test(c)) out.situacao = c
    else if (isMoney(c)) out.valor = fmtNum(parseBR(c.replace(/[^\d.,]/g, "")))
    else desc.push(c)
  }
  out.descricao = desc.join(" ")
  // pendência: se só veio data cheia (dd/mm/aaaa), deriva a competência (MM/AAAA)
  if (modo === "pendencia" && !out.competencia && out.vencimento) out.competencia = out.vencimento.slice(3)
  return out
}

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

// Botão-pílula "conta na carga efetiva" (dimensão competência). Ligado = a guia soma
// na alíquota efetiva e aparece na composição (rosca). Desligado = só no caixa do mês.
function ContaToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button" onClick={onToggle} aria-pressed={on}
      title={on ? "Conta na carga efetiva — clique para excluir" : "Fora da carga efetiva — clique para incluir"}
      className={"w-full text-[11px] font-semibold px-2 py-2 rounded-md border transition-colors " + (on ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-white text-[var(--muted)] border-[var(--line)] hover:bg-[var(--tint)]")}
    >
      {on ? "carga ✓" : "carga ✕"}
    </button>
  )
}

// Seção recolhível (accordion) — cabeçalho clicável, acessível (aria-expanded), com resumo.
function Section({ n, title, subtitle, open, onToggle, children }: { n: number; title: string; subtitle?: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <button type="button" onClick={onToggle} aria-expanded={open} className={"w-full flex items-center gap-3 p-4 text-left transition-colors " + (open ? "bg-[var(--tint)]" : "hover:bg-[#faf8f3]")}>
        <i className="block h-0.5 w-4 shrink-0 rounded-sm" style={{ background: "var(--gold-grad)" }} aria-hidden="true" />
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-white text-xs font-bold" style={{ fontFamily: "var(--font-jost), sans-serif" }}>{n}</span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold leading-tight" style={{ fontFamily: "var(--font-jost), sans-serif" }}>{title}</span>
          {subtitle && <span className="block text-xs text-[var(--muted)] truncate">{subtitle}</span>}
        </span>
        <ChevronDown className={"h-4 w-4 shrink-0 text-[var(--muted)] transition-transform " + (open ? "rotate-180" : "")} />
      </button>
      {open && <div className="px-5 pb-5 pt-4 border-t border-[var(--line)]">{children}</div>}
    </div>
  )
}

// Cockpit de KPIs ao vivo — leitura instantânea do resultado enquanto se edita.
// Lê direto da apuração: impostos do mês (competência) × total a recolher (com parcelamentos).
function Cockpit({ ap }: { ap: Apuracao }) {
  const jost = { fontFamily: "var(--font-jost), sans-serif" }
  const cells = [
    { k: "Faturamento", v: fmtBRL(ap.revenue) },
    { k: "Impostos do mês", v: fmtBRL(ap.totPagarMes) },
    { k: "Alíquota efetiva", v: fmtPct(ap.aliqEfetiva) },
    { k: "Total a recolher", v: fmtBRL(ap.totPagar) },
  ]
  return (
    <div className="rounded-xl border border-[var(--line)] overflow-hidden mb-5 no-print">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--line)]">
        {cells.map((c, i) => (
          <div key={i} className="bg-white px-4 py-3">
            <div className="text-[10px] font-semibold uppercase text-[var(--gold)] mb-1.5" style={{ ...jost, letterSpacing: ".12em" }}>{c.k}</div>
            <div className="text-xl font-semibold text-[var(--navy)] tabular-nums" style={jost}>{c.v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Detecta tela larga (≥lg) p/ alternar entre split-view (editor + preview lado a
// lado) e o fluxo de abas no mobile. Default false (mobile-first) p/ casar com o SSR.
function useIsWide() {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const on = () => setWide(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return wide
}

// Atrasa um valor: o preview (relatório A4, DOM pesado) só re-renderiza quando o
// usuário pausa a digitação. O cockpit e os inputs continuam instantâneos.
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

export default function RelatorioPage() {
  const [cd, setCd] = useState<ClientData>(blank())
  const [pgdasText, setPgdasText] = useState("")
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [tab, setTab] = useState<"editar" | "visualizar">("editar")
  const [params, setParams] = useState<ParametrosFiscais>(PARAMETROS_PADRAO)
  const [openSec, setOpenSec] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true })
  const [parcelaPaste, setParcelaPaste] = useState("")
  const [pendPaste, setPendPaste] = useState("")
  const toggleSec = (n: number) => setOpenSec((o) => ({ ...o, [n]: !o[n] }))

  const hydrated = useRef(false)
  // Carrega parâmetros + restaura o rascunho salvo (não perde o trabalho ao navegar).
  useEffect(() => {
    const pr = getParametros()
    setParams(pr)
    const draft = getDraft()
    setCd((p) => {
      const base = draft ? { ...blank(), ...draft } : p
      return base.issRate ? base : { ...base, issRate: String(pr.issPadrao).replace(".", ",") }
    })
  }, [])
  // Autossalva o rascunho a cada mudança (pula o primeiro render, antes da hidratação).
  useEffect(() => {
    if (!hydrated.current) { hydrated.current = true; return }
    saveDraft(cd)
  }, [cd])
  // Limpa o rascunho e recomeça do zero.
  const limparTudo = () => { clearDraft(); setCd({ ...blank(), issRate: String(params.issPadrao).replace(".", ",") }); setPgdasText(""); toastInfo("Rascunho limpo.") }

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
        if (next.atividade !== "Serviços") next.sujeitoFatorR = false // Fator R só p/ serviços
      }
      if (next.regime !== "Simples Nacional") next.sujeitoFatorR = false
      return next
    })
  // Enquadramento dos serviços no Simples: Anexo III fixo (§5º-B), Anexo IV, ou sujeito ao
  // Fator R (serviços intelectuais §5º-I — sistema decide III/V pela folha).
  const setEnquadramento = (val: string) =>
    setCd((p) => (val === "fatorR" ? { ...p, sujeitoFatorR: true, anexo: "Anexo III" } : { ...p, sujeitoFatorR: false, anexo: val as Anexo }))
  const updRet = (tax: string, v: string) => setCd((p) => ({ ...p, ret: { ...(p.ret || {}), [tax]: v } }))
  const updRepart = (tax: string, v: string) => setCd((p) => ({ ...p, repartManual: { ...(p.repartManual || {}), [tax]: v } }))
  const setMeiCategoria = (cat: string) => setCd((p) => ({ ...p, meiCategoria: cat, meiDasFixo: fmtNum(MEI_DAS_2026[cat]?.das ?? 0) }))
  // Atividades (empresa com mais de uma) — receita por atividade, cada uma com seu enquadramento.
  const addAtividade = () => setCd((p) => ({ ...p, atividades: [...(p.atividades || []), { id: uid(), descricao: "", receita: "", ...(p.regime === "Simples Nacional" ? { anexo: p.anexo || "Anexo III" } : { tipo: p.atividade || "Serviços" }) }] }))
  const updAtividade = (id: string, field: keyof AtividadeLinha, v: any) => setCd((p) => ({ ...p, atividades: (p.atividades || []).map((a) => (a.id === id ? { ...a, [field]: v } : a)) }))
  const delAtividade = (id: string) => setCd((p) => ({ ...p, atividades: (p.atividades || []).filter((a) => a.id !== id) }))
  // itens/guias extras (manuais) — entram nos vencimentos, composição e total
  const addItem = () => setCd((p) => ({ ...p, extraTaxes: [...(p.extraTaxes || []), { id: uid(), tax: "", value: "", group: "Outros" }] }))
  const updItem = (id: string | number, field: keyof ExtraTax, v: any) =>
    setCd((p) => ({ ...p, extraTaxes: (p.extraTaxes || []).map((e) => (e.id === id ? { ...e, [field]: v } : e)) }))
  const delItem = (id: string | number) => setCd((p) => ({ ...p, extraTaxes: (p.extraTaxes || []).filter((e) => e.id !== id) }))
  const setOverride = (tax: string, field: "value" | "dueDate" | "conta", v: string | boolean) =>
    setCd((p) => ({ ...p, overrides: { ...(p.overrides || {}), [tax]: { ...(p.overrides?.[tax] || {}), [field]: v } } }))
  const recalcular = () => setCd((p) => { const n = { ...p }; delete n.overrides; return n })

  // ----- Parcelamentos (são extraTaxes do grupo "Parcelamento" — entram no total) -----
  const addParcela = () => setCd((p) => ({ ...p, extraTaxes: [...(p.extraTaxes || []), { id: uid(), tax: "", value: "", group: "Parcelamento", parcelaNum: "", parcelaTot: "", dueDate: "" }] }))
  const colarParcelas = (text: string) => {
    const novos: ExtraTax[] = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const r = classificarColado(l, "parcela")
      return { id: uid(), tax: r.descricao || "Parcelamento", value: r.valor, dueDate: r.vencimento, group: "Parcelamento", parcelaNum: r.parcelaNum, parcelaTot: r.parcelaTot }
    })
    if (novos.length) { setCd((p) => ({ ...p, extraTaxes: [...(p.extraTaxes || []), ...novos] })); toastSuccess(`${novos.length} parcelamento(s) adicionado(s).`) }
  }
  // ----- Pendências / débitos em aberto (informativos — NÃO entram no total) -----
  const addPend = () => setCd((p) => ({ ...p, pendencias: [...(p.pendencias || []), { id: uid(), descricao: "", valor: "", competencia: "", situacao: "" }] }))
  const updPend = (id: string, field: keyof Pendencia, v: string | boolean) =>
    setCd((p) => ({ ...p, pendencias: (p.pendencias || []).map((x) => (x.id === id ? { ...x, [field]: v } : x)) }))
  const delPend = (id: string) => setCd((p) => ({ ...p, pendencias: (p.pendencias || []).filter((x) => x.id !== id) }))
  const colarPendencias = (text: string) => {
    const novas: Pendencia[] = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const r = classificarColado(l, "pendencia")
      return { id: uid(), descricao: r.descricao || "Débito", valor: r.valor, competencia: r.competencia, situacao: r.situacao }
    })
    if (novas.length) { setCd((p) => ({ ...p, pendencias: [...(p.pendencias || []), ...novas] })); toastSuccess(`${novas.length} pendência(s) adicionada(s).`) }
  }

  const ap = useMemo(() => computeApuracao(cd, params), [cd, params])
  // Projeção Lucro Presumido (comparativo ao vivo) — só faz sentido p/ Simples.
  const comp = useMemo(() => simularComparativo(cd, ap, params), [cd, ap, params])
  const temComercio = cd.atividade !== "Serviços" || (cd.atividades || []).some((a) => a.anexo === "Anexo I" || a.anexo === "Anexo II" || a.tipo === "Comércio" || a.tipo === "Indústria")
  const isWide = useIsWide()
  // Apuração "atrasada" só para o preview/export — evita re-render do relatório a cada tecla.
  const cdView = useDebounced(cd, 250)
  const apView = useMemo(() => computeApuracao(cdView, params), [cdView, params])
  const compLabel = cd.compMonth ? `${MONTHS[parseInt(cd.compMonth) - 1]}/${cd.compYear || ""}` : ""

  function applyPgdas(raw: string): boolean {
    const res = parsePGDAS(raw)
    if (!res) { toastError("Não consegui identificar. Anexe a Declaração ou o Extrato do PGDAS-D."); return false }
    const f = res.fields
    const comp = f.compMonth && f.compYear ? String(f.compMonth).padStart(2, "0") + "/" + f.compYear : cd.competenceShort
    // Múltiplas atividades: popula a tabela por atividade (senão limpa → atividade única).
    const multiAtiv = (res.atividades?.length || 0) > 1
    const novasAtiv: AtividadeLinha[] | undefined = multiAtiv
      ? res.atividades.map((a) => ({ id: uid(), descricao: a.descricao || "", receita: a.receita || "", anexo: (a.anexo as Anexo) || undefined, dasAtividade: a.total || "", substituicaoICMS: a.substituicaoICMS, monofasica: a.monofasica }))
      : undefined
    setCd((p) => ({
      ...p,
      regime: "Simples Nacional",
      atividades: novasAtiv,
      clientName: f.clientName || p.clientName,
      cnpj: f.cnpj ? fmtCNPJ(f.cnpj) : p.cnpj,
      compMonth: f.compMonth || p.compMonth,
      compYear: f.compYear || p.compYear,
      competenceShort: comp,
      atividade: (f.atividade as Atividade) || p.atividade || "Serviços",
      anexo: (f.anexo as Anexo) || p.anexo || "Anexo III",
      // Anexo V no extrato ⇒ atividade sujeita ao Fator R (V só existe via Fator R < 28%).
      sujeitoFatorR: f.anexo === "Anexo V" ? true : p.sujeitoFatorR,
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
    // Comércio/indústria: o comparativo com o Lucro Presumido precisa do ICMS efetivo,
    // que NÃO vem no PGDAS-D (o ICMS do DAS é o do Simples). Avisa onde informar.
    const ativImp = (f.atividade as string) || (f.anexo === "Anexo I" ? "Comércio" : f.anexo === "Anexo II" ? "Indústria" : "Serviços")
    if (ativImp !== "Serviços" && !parseBR(cd.icmsCompPct)) {
      toastWarning("Para comparar com o Lucro Presumido, informe o ICMS efetivo (%) em “Faturamento” (Seção 3). O ICMS não vem no PGDAS-D.")
    }
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
          <h1 className="text-2xl text-[var(--navy)]" style={{ fontFamily: "var(--font-jost), sans-serif", fontWeight: 600 }}>Relatório Mensal</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Importe o PGDAS-D (Simples) ou informe os dados (Lucro Presumido/Real, MEI) e gere o relatório para baixar ou imprimir.</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {(isWide || tab === "editar") && <button className="btn btn-outline" onClick={limparTudo} title="Apaga o rascunho e recomeça"><Trash2 className="h-4 w-4" /> Limpar</button>}
          {(isWide || tab === "visualizar") && <button className="btn btn-outline" disabled={exporting} onClick={baixarPdf}><Download className="h-4 w-4" /> {exporting ? "Gerando…" : "Baixar PDF"}</button>}
          {(isWide || tab === "visualizar") && <button className="btn btn-gold" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir / PDF</button>}
        </div>
      </div>

      <Cockpit ap={ap} />

      {/* Abas só no mobile/tablet — em ≥lg o split mostra editor e preview juntos */}
      {!isWide && (
        <div className="flex gap-1 mb-5 no-print">
          <button className={"btn " + (tab === "editar" ? "btn-primary" : "btn-outline")} onClick={() => setTab("editar")}><FileText className="h-4 w-4" /> Editar</button>
          <button className={"btn " + (tab === "visualizar" ? "btn-primary" : "btn-outline")} onClick={() => setTab("visualizar")}><Calculator className="h-4 w-4" /> Visualizar</button>
        </div>
      )}

      <div className={isWide ? "grid grid-cols-2 gap-6 items-start" : ""}>
      {(isWide || tab === "editar") && (
        <div className="space-y-4 no-print max-w-4xl lg:max-w-none min-w-0">
          {/* Atalho: importar PGDAS-D (Simples) — preenche as seções automaticamente */}
          {isSN && (
            <div className="card p-5 border-[var(--gold)] bg-[#fdfaf2]">
              <h2 className="font-semibold mb-1 flex items-center gap-2"><Upload className="h-4 w-4" /> Importar PGDAS-D <span className="chip bg-[#fbeed4] text-[#a86c12]">preenche tudo</span></h2>
              <p className="text-xs text-[var(--muted)] mb-3">Anexe o PDF ou cole o texto da Declaração/Extrato — identifica empresa, competência, anexo, faturamento, RBT12 e a repartição do DAS.</p>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <label className="btn btn-outline cursor-pointer">
                  <Upload className="h-4 w-4" /> {busy ? "Lendo PDF…" : "Anexar PDF"}
                  <input type="file" accept="application/pdf" className="hidden" onChange={(e) => readPdf(e.target.files?.[0])} />
                </label>
                {dasOk && <span className="text-xs font-semibold text-emerald-600">✓ DAS calculado {fmtBRL(ap.sn!.das)} confere com o PGDAS</span>}
                {cd.dasOfficial && !dasOk && <span className="text-xs font-semibold text-amber-600">DAS difere do extrato ({fmtBRL(cd.dasOfficial)})</span>}
              </div>
              <textarea className="input font-mono text-xs min-h-[64px]" value={pgdasText} onChange={(e) => setPgdasText(e.target.value)} placeholder="…ou cole aqui o texto do PGDAS-D" />
              <button className="btn btn-primary mt-2 text-sm" onClick={() => { if (applyPgdas(pgdasText)) setPgdasText("") }}><Sparkles className="h-4 w-4" /> Preencher</button>
            </div>
          )}

          {/* Projeção Lucro Presumido — comparação ao vivo (só p/ Simples) */}
          {isSN && (
            <div className="card p-5">
              <h2 className="font-semibold mb-1 flex items-center gap-2"><Scale className="h-4 w-4" /> Projeção Lucro Presumido</h2>
              <p className="text-xs text-[var(--muted)] mb-3">Compara ao vivo o Simples (DAS) com o que a empresa pagaria no Lucro Presumido. Monofásico e ICMS-ST do PGDAS-D já entram; folha/pró-labore (Seção 4) e ISS (Seção 3) também.</p>
              {comp.simulavel ? (
                <>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className={"rounded-lg border p-3 " + (comp.melhor === "Simples Nacional" ? "border-emerald-300 bg-emerald-50/50" : "border-[var(--line)]")}>
                      <p className="text-[10px] uppercase text-[var(--muted)] font-bold">Simples (atual)</p>
                      <p className="text-lg font-bold text-[var(--navy)] tabular-nums">{fmtBRL(comp.totalSimples)}</p>
                    </div>
                    <div className={"rounded-lg border p-3 " + (comp.melhor === "Lucro Presumido" ? "border-emerald-300 bg-emerald-50/50" : "border-[var(--line)]")}>
                      <p className="text-[10px] uppercase text-[var(--muted)] font-bold">Lucro Presumido</p>
                      <p className="text-lg font-bold text-[var(--navy)] tabular-nums">{fmtBRL(comp.totalPresumido)}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--gold)] bg-[#fdfaf2] p-3">
                      <p className="text-[10px] uppercase text-[var(--gold)] font-bold">Mais econômico</p>
                      <p className="text-sm font-bold text-[var(--navy)]">{comp.melhor}</p>
                      <p className="text-xs text-[var(--muted)] tabular-nums">{fmtBRL(comp.economia)}/mês</p>
                    </div>
                  </div>
                  {comp.estimado && <p className="mt-2 text-[11px] leading-snug text-[var(--muted)]">Comércio: ICMS estimado pela alíquota efetiva informada, líquido de ST — confirme no SPED. Os demais tributos são exatos.</p>}
                </>
              ) : (
                <p className="text-sm text-[var(--muted)]">{temComercio ? <>Para projetar o comércio, informe o <b>ICMS efetivo (%)</b> abaixo.</> : "Informe o faturamento (ou importe o PGDAS-D) para ver a projeção."}</p>
              )}
              {temComercio && (
                <label className="block mt-3 max-w-xs"><span className="label">ICMS efetivo (%) <span className="text-[var(--muted)] font-normal">— vendas tributáveis (fora ST)</span></span>
                  <input className="input" value={cd.icmsCompPct ?? ""} onChange={(e) => upd("icmsCompPct", e.target.value)} placeholder="ex.: 7" /></label>
              )}
            </div>
          )}

          {/* 1 · Empresa & Competência */}
          <Section n={1} title="Empresa & Competência" open={!!openSec[1]} onToggle={() => toggleSec(1)}
            subtitle={[cd.clientName, compLabel].filter(Boolean).join(" · ") || "Identificação do cliente e do mês"}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <label className="block md:col-span-2"><span className="label">Razão social / Nome</span>
                <input className="input" value={cd.clientName || ""} onChange={(e) => upd("clientName", e.target.value)} placeholder="Empresa do cliente" /></label>
              <label className="block md:col-span-2"><span className="label">CNPJ</span>
                <input className="input" value={cd.cnpj || ""} onChange={(e) => upd("cnpj", fmtCNPJ(e.target.value))} placeholder="00.000.000/0000-00" /></label>
              <label className="block"><span className="label">Mês</span>
                <select className="input" value={cd.compMonth || ""} onChange={(e) => { upd("compMonth", e.target.value); upd("competenceShort", e.target.value.padStart(2, "0") + "/" + (cd.compYear || "")) }}>
                  <option value="">Mês</option>
                  {MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
                </select></label>
              <label className="block"><span className="label">Ano</span>
                <select className="input" value={cd.compYear || ""} onChange={(e) => upd("compYear", e.target.value)}>
                  {YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                </select></label>
            </div>
          </Section>

          {/* 2 · Regime & Enquadramento */}
          <Section n={2} title="Regime & Enquadramento" open={!!openSec[2]} onToggle={() => toggleSec(2)}
            subtitle={cd.regime + (isSN && cd.anexo ? ` · ${cd.anexo}` : isMEI && cd.meiCategoria ? ` · ${cd.meiCategoria}` : cd.atividade ? ` · ${cd.atividade}` : "")}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="block"><span className="label">Regime tributário</span>
                <select className="input" value={cd.regime} onChange={(e) => upd("regime", e.target.value)}>
                  {REGIMES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select></label>
              <label className="block"><span className="label">Atividade</span>
                <select className="input" value={cd.atividade} onChange={(e) => upd("atividade", e.target.value)}>
                  {ATIVIDADES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select></label>
              {isSN && cd.atividade === "Serviços" && (
                <label className="block md:col-span-2"><span className="label">Enquadramento do serviço</span>
                  <select className="input" value={cd.sujeitoFatorR ? "fatorR" : (cd.anexo === "Anexo IV" ? "Anexo IV" : "Anexo III")} onChange={(e) => setEnquadramento(e.target.value)}>
                    <option value="Anexo III">Anexo III — serviços sem Fator R (§5º-B: clínicas de fisioterapia, agências, etc.)</option>
                    <option value="fatorR">Sujeito ao Fator R — Anexo III ou V conforme a folha (serviços intelectuais)</option>
                    <option value="Anexo IV">Anexo IV — construção, advocacia, limpeza, vigilância</option>
                  </select>
                  <span className="mt-1 block text-[11px] leading-snug text-[var(--muted)]">
                    {cd.sujeitoFatorR ? "O sistema aplica o Anexo III (Fator R ≥ 28%) ou o Anexo V (< 28%) conforme a folha dos últimos 12 meses." : cd.anexo === "Anexo IV" ? "CPP patronal recolhida em guia à parte (fora do DAS)." : "Serviços não intelectuais — sempre Anexo III, sem Fator R."}
                  </span></label>
              )}
              {isSN && cd.atividade !== "Serviços" && (
                <div><span className="label">Anexo</span>
                  <div className="input flex items-center bg-[#f7f5ef] text-[var(--muted)] cursor-default">{cd.anexo} — {cd.atividade}</div></div>
              )}
              {isSN && cd.sujeitoFatorR && (
                <label className="block"><span className="label">Folha + pró-labore 12m <span className="text-[var(--muted)] font-normal">(Fator R)</span></span>
                  <Money value={cd.folha12m} onChange={(v) => upd("folha12m", v)} /></label>
              )}
              {isMEI && (
                <>
                  <label className="block md:col-span-2"><span className="label">Categoria (SIMEI)</span>
                    <select className="input" value={cd.meiCategoria || ""} onChange={(e) => setMeiCategoria(e.target.value)}>
                      <option value="">Selecione…</option>
                      {MEI_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select></label>
                  <label className="block"><span className="label">DAS-MEI do mês (R$)</span>
                    <Money value={cd.meiDasFixo} onChange={(v) => upd("meiDasFixo", v)} /></label>
                </>
              )}
            </div>
            {/* Análise do Fator R ao vivo */}
            {isSN && ap.sn && cd.sujeitoFatorR && ap.sn.rbt12 > 0 && (
              <div className={"mt-4 rounded-xl border p-4 " + (ap.sn.fatorR >= 28 ? "border-emerald-300 bg-emerald-50/40" : "border-amber-300 bg-amber-50/40")}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2"><Scale className="h-4 w-4" /> Análise do Fator R</h3>
                  <span className={"chip text-white " + (ap.sn.fatorR >= 28 ? "bg-emerald-600" : "bg-amber-500")}>{ap.sn.fatorR >= 28 ? "Anexo III aplicado" : "Anexo V aplicado"}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg border border-[var(--line)] bg-white p-3"><p className="text-[10px] uppercase text-[var(--muted)] font-bold">Fator R</p><p className={"text-xl font-bold " + (ap.sn.fatorR >= 28 ? "text-emerald-600" : "text-amber-600")}>{ap.sn.fatorR.toFixed(2).replace(".", ",")}%</p></div>
                  <div className="rounded-lg border border-[var(--line)] bg-white p-3"><p className="text-[10px] uppercase text-[var(--muted)] font-bold">Alíquota efetiva</p><p className="text-xl font-bold">{ap.sn.rate.toFixed(2).replace(".", ",")}%</p></div>
                  <div className="rounded-lg border border-[var(--line)] bg-white p-3"><p className="text-[10px] uppercase text-[var(--muted)] font-bold">DAS do mês</p><p className="text-xl font-bold">{fmtBRL(ap.sn.das)}</p></div>
                </div>
              </div>
            )}
          </Section>

          {/* 3 · Faturamento */}
          <Section n={3} title="Faturamento" open={!!openSec[3]} onToggle={() => toggleSec(3)}
            subtitle={ap.revenue > 0 ? `Receita do mês ${fmtBRL(ap.revenue)}` : "Receita do mês e acumulado 12m"}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="block"><span className="label">Faturamento do mês (R$){(cd.atividades?.length || 0) > 0 ? " — soma das atividades" : ""}</span>
                {(cd.atividades?.length || 0) > 0
                  ? <div className="input flex items-center bg-[#f7f5ef] text-[var(--muted)] cursor-default tabular-nums">{fmtBRL(ap.revenue)}</div>
                  : <Money value={cd.revenue} onChange={(v) => upd("revenue", v)} />}</label>
              {isSN && <label className="block"><span className="label">Faturamento acum. 12m <span className="text-[var(--muted)] font-normal">(RBT12)</span></span>
                <Money value={cd.rbt12} onChange={(v) => upd("rbt12", v)} /></label>}
              {isLP && <label className="block"><span className="label">Receita do trimestre <span className="text-[var(--muted)] font-normal">(base IRPJ/CSLL)</span></span>
                <Money value={cd.receitaTrimestre} onChange={(v) => upd("receitaTrimestre", v)} />
                <span className="mt-1 block text-[11px] leading-snug text-[var(--muted)]">IRPJ/CSLL são trimestrais. Vazio = usa receita do mês × 3. Preencha para a provisão ficar exata.</span></label>}
              {!isMEI && cd.atividade === "Serviços" && (
                <label className="block"><span className="label">Alíquota ISS (%){isSN ? " — p/ comparativo" : ""}</span>
                  <input className="input" value={cd.issRate ?? ""} onChange={(e) => upd("issRate", e.target.value)} placeholder={String(params.issPadrao).replace(".", ",")} /></label>
              )}
              {!isMEI && cd.atividade !== "Serviços" && (
                <label className="block"><span className="label">ICMS efetivo (%) <span className="text-[var(--muted)] font-normal">— p/ comparativo</span></span>
                  <input className="input" value={cd.icmsCompPct ?? ""} onChange={(e) => upd("icmsCompPct", e.target.value)} placeholder="ex.: 7" />
                  <span className="mt-1 block text-[11px] leading-snug text-[var(--muted)]">ICMS sobre vendas, líquido dos créditos de entrada — estima o Lucro Presumido no comparativo.</span></label>
              )}
              <label className="block"><span className="label">Nº de notas emitidas <span className="text-[var(--muted)] font-normal">(ticket médio)</span></span>
                <input className="input" inputMode="numeric" value={cd.numNotas || ""} onChange={(e) => upd("numNotas", e.target.value.replace(/\D/g, ""))} placeholder="ex.: 312" /></label>
            </div>

            {/* Atividades (opcional) — só para empresas com mais de uma atividade */}
            {!isMEI && (
              <div className="mt-4 pt-4 border-t border-[var(--line)]">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold flex items-center gap-2 text-sm">Atividades <span className="text-[var(--muted)] font-normal text-xs">(opcional — só se a empresa tiver mais de uma)</span></h3>
                  <button className="btn btn-outline text-xs px-2 py-1" onClick={addAtividade}><Plus className="h-3.5 w-3.5" /> Adicionar atividade</button>
                </div>
                {(cd.atividades || []).length > 0 && (
                  <>
                    <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] uppercase font-semibold text-[var(--muted)] px-1 mb-1">
                      <div className="col-span-5">Descrição</div><div className="col-span-3">Receita (R$)</div><div className="col-span-3">{isSN ? "Anexo" : "Tipo"}</div><div className="col-span-1"></div>
                    </div>
                    <div className="space-y-2">
                      {(cd.atividades || []).map((a) => (
                        <div key={a.id} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center">
                          <div className="col-span-2 md:col-span-5"><input className="input" value={a.descricao} onChange={(e) => updAtividade(a.id, "descricao", e.target.value)} placeholder="Ex.: Comércio de peças" /></div>
                          <div className="md:col-span-3"><Money value={a.receita} onChange={(v) => updAtividade(a.id, "receita", v)} /></div>
                          <div className="md:col-span-3">
                            {isSN
                              ? <select className="input" value={a.anexo || ""} onChange={(e) => updAtividade(a.id, "anexo", e.target.value)}><option value="">Anexo…</option>{ANEXOS.map((x) => <option key={x} value={x}>{x}</option>)}</select>
                              : <select className="input" value={a.tipo || ""} onChange={(e) => updAtividade(a.id, "tipo", e.target.value)}><option value="">Tipo…</option>{ATIVIDADES.map((x) => <option key={x} value={x}>{x}</option>)}</select>}
                          </div>
                          <div className="md:col-span-1"><button className="btn btn-outline px-2 py-2 text-red-600 w-full" onClick={() => delAtividade(a.id)} aria-label="Remover"><Trash2 className="h-3.5 w-3.5" /></button></div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-snug text-[var(--muted)]">Com atividades preenchidas, o faturamento e os impostos passam a ser calculados por atividade{isSN ? " — no Simples o DAS do PGDAS-D prevalece como total" : " — cada uma na sua presunção"}.</p>
                  </>
                )}
              </div>
            )}
          </Section>

          {/* 4 · Folha & Pró-labore */}
          {!isMEI && (
            <Section n={4} title="Folha & Pró-labore" open={!!openSec[4]} onToggle={() => toggleSec(4)}
              subtitle={(() => { const f = parseBR(cd.folhaMensal), pl = parseBR(cd.proLabore); return (f > 0 || pl > 0) ? [f > 0 ? `Folha ${fmtBRL(f)}` : "", pl > 0 ? `Pró-labore ${fmtBRL(pl)}` : ""].filter(Boolean).join(" · ") : "Salários, pró-labore e retenções (opcional)" })()}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="block"><span className="label">Folha de salários do mês (R$)</span>
                  <Money value={cd.folhaMensal} onChange={(v) => upd("folhaMensal", v)} /></label>
                <label className="block"><span className="label">Pró-labore do mês (R$)</span>
                  <Money value={cd.proLabore} onChange={(v) => upd("proLabore", v)} /></label>
                {parseBR(cd.proLabore) > 0 && <label className="block"><span className="label">Dependentes <span className="text-[var(--muted)] font-normal">(IRRF)</span></span>
                  <input className="input" inputMode="numeric" value={cd.proLaboreDeps || ""} onChange={(e) => upd("proLaboreDeps", e.target.value.replace(/\D/g, ""))} placeholder="0" /></label>}
                <label className="block"><span className="label">INSS retido dos empregados (R$)</span>
                  <Money value={cd.inssRetidoFolha} onChange={(v) => upd("inssRetidoFolha", v)} /></label>
                <label className="block"><span className="label">IRRF retido da folha (R$)</span>
                  <Money value={cd.irrfFolha} onChange={(v) => upd("irrfFolha", v)} /></label>
                {isLP && cd.atividade !== "Serviços" && <label className="block"><span className="label">ICMS a recolher (R$)</span>
                  <Money value={cd.icmsRecolher} onChange={(v) => upd("icmsRecolher", v)} /></label>}
              </div>
              {isLP && cd.atividade === "Serviços" && (
                <label className="mt-4 flex items-center gap-3 rounded-lg border border-[var(--line)] p-3 cursor-pointer bg-emerald-50/60">
                  <input type="checkbox" checked={!!cd.equipHospitalar} onChange={(e) => upd("equipHospitalar", e.target.checked)} />
                  <span className="text-xs"><b>Equiparação hospitalar</b> — presunção 8%/12% em vez de 32%. O relatório mostra a economia.</span>
                </label>
              )}
            </Section>
          )}

          {/* 5 · Impostos & Observações */}
          <Section n={5} title="Impostos & Observações" open={!!openSec[5]} onToggle={() => toggleSec(5)}
            subtitle={(() => { const g = ap.taxes.filter((t) => parseBR(t.value) > 0).length; return g > 0 ? `${g} guia${g !== 1 ? "s" : ""} a recolher` : "Guias, retenções e observações" })()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2 text-sm"><Scale className="h-4 w-4" /> Impostos a recolher</h3>
              <div className="flex gap-2">
                <button className="btn btn-outline text-xs px-2 py-1" onClick={recalcular} title="Voltar aos valores calculados">Recalcular</button>
                <button className="btn btn-outline text-xs px-2 py-1" onClick={addItem}><Plus className="h-3.5 w-3.5" /> Adicionar guia</button>
              </div>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] uppercase font-semibold text-[var(--muted)] px-1 mb-1">
              <div className="col-span-4">Tributo</div><div className="col-span-3">Valor (R$)</div><div className="col-span-3">Vencimento</div><div className="col-span-2" title="Conta na alíquota efetiva e na composição">Carga</div>
            </div>
            <div className="space-y-2">
              {ap.taxes.filter((t) => !t.manual).map((t, i) => (
                <div key={t.tax || i} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center">
                  <div className="col-span-2 md:col-span-4"><div className="px-1 text-sm font-medium text-[var(--ink)]">{t.tax}<span className="text-[10px] text-[var(--muted)] ml-2 uppercase tracking-wide">{t.group}</span></div></div>
                  <div className="md:col-span-3"><Money value={cd.overrides?.[t.tax]?.value ?? t.value} onChange={(v) => setOverride(t.tax, "value", v)} /></div>
                  <div className="md:col-span-3"><DateBR value={cd.overrides?.[t.tax]?.dueDate ?? t.dueDate} onChange={(v) => setOverride(t.tax, "dueDate", v)} /></div>
                  <div className="md:col-span-2"><ContaToggle on={!!t.contaCompetencia} onToggle={() => setOverride(t.tax, "conta", !t.contaCompetencia)} /></div>
                </div>
              ))}
              {(cd.extraTaxes || []).filter((e) => e.group !== "Parcelamento").map((e) => (
                <div key={e.id} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center">
                  <div className="col-span-2 md:col-span-4"><input className="input" value={e.tax} onChange={(ev) => updItem(e.id!, "tax", ev.target.value)} placeholder="Nome da guia (ex.: DARF IRRF)" /></div>
                  <div className="md:col-span-3"><Money value={e.value} onChange={(v) => updItem(e.id!, "value", v)} /></div>
                  <div className="md:col-span-3"><DateBR value={e.dueDate} onChange={(v) => updItem(e.id!, "dueDate", v)} /></div>
                  <div className="md:col-span-2 flex items-center gap-1">
                    <ContaToggle on={e.contaCompetencia ?? true} onToggle={() => updItem(e.id!, "contaCompetencia", !(e.contaCompetencia ?? true))} />
                    <button className="btn btn-outline px-2 py-2 text-red-600 shrink-0" onClick={() => delItem(e.id!)} aria-label="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
              {ap.taxes.filter((t) => !t.manual).length === 0 && (cd.extraTaxes || []).filter((e) => e.group !== "Parcelamento").length === 0 && <div className="text-sm text-[var(--muted)] px-1">Informe o faturamento (ou importe o PGDAS-D) para calcular os impostos, ou clique em “Adicionar guia”.</div>}
            </div>

            {retEligible.length > 0 && (
              <div className="mt-5 pt-4 border-t border-[var(--line)]">
                <h3 className="text-sm font-semibold mb-2">Retenções na fonte <span className="text-[var(--muted)] font-normal">(opcional)</span></h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {retEligible.map((t) => <label key={t.tax} className="block"><span className="label">{t.tax} retido</span><Money value={(cd.ret || {})[t.tax]} onChange={(v) => updRet(t.tax, v)} /></label>)}
                </div>
              </div>
            )}

            <div className="mt-5 pt-4 border-t border-[var(--line)]">
              <label className="block"><span className="label">Observações &amp; recomendações <span className="text-[var(--muted)] font-normal">(aparecem como seção no relatório)</span></span>
                <textarea className="input min-h-[90px]" value={cd.observacoes || ""} onChange={(e) => upd("observacoes", e.target.value)} placeholder="Ex.: Lembrar o cliente do reajuste do pró-labore; conferir notas em atraso; etc." /></label>
            </div>
          </Section>

          {/* 6 · Parcelamentos & Pendências */}
          <Section n={6} title="Parcelamentos & Pendências" open={!!openSec[6]} onToggle={() => toggleSec(6)}
            subtitle={(() => { const np = (cd.extraTaxes || []).filter((e) => e.group === "Parcelamento").length, nd = (cd.pendencias || []).length; return (np || nd) ? [np ? `${np} parcelamento${np !== 1 ? "s" : ""}` : "", nd ? `${nd} pendência${nd !== 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ") : "Parcelamentos em curso e débitos em aberto" })()}>
            {/* Parcelamentos */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold flex items-center gap-2 text-sm"><ListPlus className="h-4 w-4" /> Parcelamentos <span className="text-[var(--muted)] font-normal text-xs">(entram no total do mês)</span></h3>
              <button className="btn btn-outline text-xs px-2 py-1" onClick={addParcela}><Plus className="h-3.5 w-3.5" /> Adicionar</button>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] uppercase font-semibold text-[var(--muted)] px-1 mb-1">
              <div className="col-span-3">Descrição</div><div className="col-span-2">Parcela</div><div className="col-span-3">Valor (R$)</div><div className="col-span-2">Vencimento</div><div className="col-span-2" title="Conta na alíquota efetiva e na composição">Carga</div>
            </div>
            <div className="space-y-2">
              {(cd.extraTaxes || []).filter((e) => e.group === "Parcelamento").map((e) => (
                <div key={e.id} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center">
                  <div className="col-span-2 md:col-span-3"><input className="input" value={e.tax} onChange={(ev) => updItem(e.id!, "tax", ev.target.value)} placeholder="Ex.: Refis · DAS" /></div>
                  <div className="md:col-span-2 flex items-center gap-1"><input className="input text-center" inputMode="numeric" value={e.parcelaNum || ""} onChange={(ev) => updItem(e.id!, "parcelaNum", ev.target.value.replace(/\D/g, ""))} placeholder="3" /><span className="text-[var(--muted)]">/</span><input className="input text-center" inputMode="numeric" value={e.parcelaTot || ""} onChange={(ev) => updItem(e.id!, "parcelaTot", ev.target.value.replace(/\D/g, ""))} placeholder="10" /></div>
                  <div className="md:col-span-3"><Money value={e.value} onChange={(v) => updItem(e.id!, "value", v)} /></div>
                  <div className="md:col-span-2"><DateBR value={e.dueDate} onChange={(v) => updItem(e.id!, "dueDate", v)} /></div>
                  <div className="md:col-span-2 flex items-center gap-1">
                    <ContaToggle on={e.contaCompetencia ?? false} onToggle={() => updItem(e.id!, "contaCompetencia", !(e.contaCompetencia ?? false))} />
                    <button className="btn btn-outline px-2 py-2 text-red-600 shrink-0" onClick={() => delItem(e.id!)} aria-label="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2">
              <textarea className="input font-mono text-xs min-h-[52px]" value={parcelaPaste} onChange={(e) => setParcelaPaste(e.target.value)} placeholder={"Colar do Excel (uma linha por parcelamento): Descrição⇥Parcela⇥Valor⇥Vencimento\nEx.:  Refis DAS\t3/10\t1.250,00\t20/04/2026"} />
              <button className="btn btn-outline mt-1 text-xs px-2 py-1" onClick={() => { colarParcelas(parcelaPaste); setParcelaPaste("") }}><ListPlus className="h-3.5 w-3.5" /> Colar parcelamentos</button>
            </div>

            {/* Pendências */}
            <div className="mt-5 pt-4 border-t border-[var(--line)]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold flex items-center gap-2 text-sm">Pendências / débitos em aberto <span className="text-[var(--muted)] font-normal text-xs">(informativo — fora do total)</span></h3>
                <button className="btn btn-outline text-xs px-2 py-1" onClick={addPend}><Plus className="h-3.5 w-3.5" /> Adicionar</button>
              </div>
              <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] uppercase font-semibold text-[var(--muted)] px-1 mb-1">
                <div className="col-span-5">Descrição</div><div className="col-span-3">Valor (R$)</div><div className="col-span-2">Competência</div><div className="col-span-2">Situação</div>
              </div>
              <div className="space-y-2">
                {(cd.pendencias || []).map((p) => (
                  <div key={p.id} className="rounded-lg border border-[var(--line)] p-2 space-y-2">
                    <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center">
                      <div className="col-span-2 md:col-span-5"><input className="input" value={p.descricao} onChange={(ev) => updPend(p.id!, "descricao", ev.target.value)} placeholder="Ex.: DAS em atraso" /></div>
                      <div className="md:col-span-3"><Money value={p.valor} onChange={(v) => updPend(p.id!, "valor", v)} /></div>
                      <div className="md:col-span-2"><input className="input" inputMode="numeric" value={p.competencia || ""} onChange={(ev) => updPend(p.id!, "competencia", maskComp(ev.target.value))} placeholder="MM/AAAA" /></div>
                      <div className="md:col-span-2 flex items-center gap-1"><input className="input" value={p.situacao || ""} onChange={(ev) => updPend(p.id!, "situacao", ev.target.value)} placeholder="vencido" /><button className="btn btn-outline px-2 py-2 text-red-600 shrink-0" onClick={() => delPend(p.id!)} aria-label="Remover"><Trash2 className="h-3.5 w-3.5" /></button></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pl-1">
                      <label className="flex items-center gap-2 text-xs text-[var(--ink)] cursor-pointer">
                        <input type="checkbox" checked={!!p.emitiuGuia} onChange={(ev) => updPend(p.id!, "emitiuGuia", ev.target.checked)} />
                        Emitir guia neste mês <span className="text-[var(--muted)]">(entra no total a recolher)</span>
                      </label>
                      {p.emitiuGuia && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Vencimento</span>
                          <div className="w-32"><DateBR value={p.vencimento} onChange={(v) => updPend(p.id!, "vencimento", v)} /></div>
                          <div className="w-24"><ContaToggle on={!!p.contaCompetencia} onToggle={() => updPend(p.id!, "contaCompetencia", !p.contaCompetencia)} /></div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <textarea className="input font-mono text-xs min-h-[52px]" value={pendPaste} onChange={(e) => setPendPaste(e.target.value)} placeholder={"Colar do Excel (uma linha por débito): Descrição⇥Valor⇥Competência⇥Situação\nEx.:  ICMS\t3.400,00\t02/2025\tdívida ativa"} />
                <button className="btn btn-outline mt-1 text-xs px-2 py-1" onClick={() => { colarPendencias(pendPaste); setPendPaste("") }}><ListPlus className="h-3.5 w-3.5" /> Colar pendências</button>
              </div>
            </div>
          </Section>

        </div>
      )}
      {(isWide || tab === "visualizar") && (
        <div className={"min-w-0" + (isWide ? " lg:sticky lg:top-6" : "")}>
          {(() => {
            const temValores = apView.revenue > 0 || apView.taxes.some((t) => parseBR(t.value) > 0)
            // Sem faturamento e sem guias: ainda gera a declaração "sem movimento",
            // desde que Cliente e Competência estejam identificados.
            const podeSemMov = !!(cdView.clientName && cdView.compMonth && cdView.compYear)
            return temValores || podeSemMov ? (
              <div className="rounded-xl border border-[var(--line)] overflow-auto bg-[#52544a] lg:max-h-[calc(100vh-7.5rem)] print:max-h-none print:overflow-visible print:border-0">
                <div className="rep-scaler"><RelatorioMensal cd={cdView} ap={apView} evolution={[]} params={params} /></div>
              </div>
            ) : (
              <div className="card p-10 text-center text-sm text-[var(--muted)] no-print">Informe o faturamento, a folha ou ao menos uma guia (ou importe o PGDAS-D). Sem movimento no mês? Basta preencher <b>Cliente</b> e <b>Competência</b> para gerar a declaração sem movimento.</div>
            )
          })()}
        </div>
      )}
      </div>
    </div>
  )
}
