"use client"

import { useMemo } from "react"
// Relatório Mensal — 3 páginas A4 no design "Gilberto Negreiros — Dashboards Fiscais"
// (tema verde-oliva + dourado + creme; fontes Jost / IBM Plex Sans).
//   1. Carga Tributária   2. Agenda Fiscal   3. Indicadores Fiscais
// Apurações grandes (muitos vencimentos/guias) geram páginas de continuação
// "Agenda Fiscal (cont.)" — nada é cortado. id #rep-overlay e classe .sheet → PDF/print.
import { ESCRITORIO, TETO_SIMPLES, PARAMETROS_PADRAO, type ParametrosFiscais } from "@/lib/config"
import { fmtBRL, fmtPct, parseBR, fmtK, fmtKm, MONTHS, MONTHS_SHORT } from "@/lib/format"
import { simularComparativo } from "@/lib/engine"
import type { Apuracao, ClientData, HistPoint, TaxRow } from "@/lib/types"

const COMP_COLORS = ["#46562f", "#c9a23a", "#7c8c5b", "#9c7a22", "#5f7d40", "#b8902f", "#8a9a6b", "#caa84e"]
function guiaTag(tax: string) {
  if (/^DAS/.test(tax)) return "DAS"
  if (tax === "FGTS") return "FGTS"
  if (/INSS|CPP/.test(tax)) return "GPS"
  if (/IRRF/.test(tax)) return "DARF"
  if (/ISS/.test(tax)) return "ISS"
  if (/ICMS/.test(tax)) return "ICMS"
  return "DARF"
}
const uniq = (v: string, i: number, a: string[]) => a.indexOf(v) === i
function itemTag(t: TaxRow) {
  return t.group === "Parcelamento" ? "PARC" : guiaTag(t.tax)
}
// Limita a legenda da composição p/ não estourar o painel: mantém os maiores e
// agrega o restante em "Outros (N)". O donut continua somando o total real.
function capSegs(segs: { label: string; value: number }[], max = 8) {
  if (segs.length <= max) return segs
  const head = segs.slice(0, max - 1)
  const restV = segs.slice(max - 1).reduce((s, x) => s + x.value, 0)
  return [...head, { label: `Outros (${segs.length - (max - 1)})`, value: restV }]
}
// Quebra observações longas em páginas (estimando linhas visuais p/ não estourar).
function chunkObs(text: string, maxLines = 38): string[] {
  const paras = text.replace(/\r/g, "").split("\n")
  const chunks: string[] = []
  let cur: string[] = [], lines = 0
  for (const p of paras) {
    const vl = Math.max(1, Math.ceil(p.length / 95))
    if (lines + vl > maxLines && cur.length) { chunks.push(cur.join("\n")); cur = []; lines = 0 }
    cur.push(p); lines += vl
  }
  if (cur.length) chunks.push(cur.join("\n"))
  return chunks
}
function chunkArr<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/* ===================== Blocos reutilizáveis ===================== */
function Header({ title, comp, eyebrow = "Relatório Mensal" }: { title: string; comp: React.ReactNode; eyebrow?: string }) {
  return (
    <header className="hdr">
      <div className="hdr-l">
        <div>
          <div className="wm-1">{ESCRITORIO.marca}</div>
          <div className="wm-2">{ESCRITORIO.submarca.toUpperCase()}</div>
        </div>
      </div>
      <div className="hdr-r">
        <div className="h-eye">{eyebrow}</div>
        <div className="h-title">{title}</div>
        <div className="h-comp">{comp}</div>
      </div>
      <div className="hdr-rule" />
    </header>
  )
}
function ClientBar({ cols }: { cols: { k: string; v: string }[] }) {
  return (
    <div className="clientbar">
      {cols.map((c, i) => (
        <div className={"cb" + (i === cols.length - 1 ? " last" : "")} key={i}>
          <div className="cb-k">{c.k}</div>
          <div className="cb-v" title={c.v}>{c.v}</div>
        </div>
      ))}
    </div>
  )
}
function Slab({ children, rt }: { children: React.ReactNode; rt?: React.ReactNode }) {
  return <div className="slab"><i className="dash" /><span>{children}</span>{rt && <div className="clegend rt">{rt}</div>}</div>
}
function Footer({ note }: { note: string }) {
  return (
    <div className="foot">
      <div className="foot-l"><div><div className="fnm">{ESCRITORIO.nome}</div><div className="fct">{ESCRITORIO.email} · {ESCRITORIO.telefone}</div></div></div>
      <div className="foot-r">{note}</div>
    </div>
  )
}
function Kpi({ k, v, s, hl }: { k: string; v: React.ReactNode; s?: React.ReactNode; hl?: boolean }) {
  return <div className={"kpi" + (hl ? " hl" : "")}><div className="k">{k}</div><div className="v">{v}</div>{s != null && <div className="s">{s}</div>}</div>
}
const RS = ({ v }: { v: number }) => <><span className="rs">R$</span>{fmtK(v)}</>

/* ----- medidor semicircular ----- */
function Gauge({ value }: { value: number }) {
  const scaleMax = Math.max(10, Math.ceil((value * 1.25) / 5) * 5)
  const f = Math.max(0, Math.min(1, value / scaleMax))
  const ang = ((180 - 180 * f) * Math.PI) / 180
  const ex = (100 + 84 * Math.cos(ang)).toFixed(1)
  const ey = (110 - 84 * Math.sin(ang)).toFixed(1)
  return (
    <div className="gauge">
      <svg className="g-svg" viewBox="0 0 200 132">
        <path d="M16 110 A84 84 0 0 1 184 110" fill="none" stroke="#e3ddc9" strokeWidth="15" strokeLinecap="round" />
        <path d={`M16 110 A84 84 0 0 1 ${ex} ${ey}`} fill="none" stroke="#5a7c3b" strokeWidth="15" strokeLinecap="round" />
        <circle cx={ex} cy={ey} r="9" fill="#b8902f" stroke="#fff" strokeWidth="2.5" />
      </svg>
      <div className="g-read"><b>{value.toFixed(2).replace(".", ",")}%</b></div>
      <div className="g-scale"><span>0%</span><span>{scaleMax / 2}%</span><span>{scaleMax}%</span></div>
    </div>
  )
}

interface Seg { label: string; value: number }
/* ----- donut (conic) + legenda ----- */
function Donut({ segs, total }: { segs: Seg[]; total: number }) {
  const sum = segs.reduce((s, x) => s + x.value, 0) || 1
  const stops = useMemo(() => {
    let acc = 0
    return segs.map((s, i) => {
      const p = (s.value / sum) * 100
      const seg = `${COMP_COLORS[i % COMP_COLORS.length]} ${acc.toFixed(3)}% ${(acc + p).toFixed(3)}%`
      acc += p
      return seg
    })
  }, [segs, sum])
  return (
    <div className="fx ac gap16" style={{ flex: 1 }}>
      <div className="donut" style={{ background: `conic-gradient(${stops.join(",")})` }}>
        <div className="donut-h"><b>R$ {fmtKm(total)}</b><small>TOTAL</small></div>
      </div>
      <div className="leg">
        {segs.map((s, i) => (
          <div className="leg-i" key={i}>
            <i style={{ background: COMP_COLORS[i % COMP_COLORS.length] }} /><span className="leg-lab" title={s.label}>{s.label}</span>
            <span className="leg-v num">{fmtK(s.value)}</span>
            <span className="leg-p">{((s.value / sum) * 100).toFixed(1).replace(".", ",")}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CmpRow({ name, cls, w, val }: { name: string; cls: string; w: number; val: string }) {
  return (
    <div className="cmp-row">
      <div className="cmp-name">{name}</div>
      <div className="cmp-track"><div className={"cmp-fill " + cls} style={{ width: `${w.toFixed(1)}%` }} /></div>
      <div className="cmp-val">{val}</div>
    </div>
  )
}

function CompTable({ comp }: { comp: ReturnType<typeof simularComparativo> }) {
  if (!comp.simulavel) return <div className="g-note" style={{ maxWidth: "none" }}>Informe RBT12 e o anexo para comparar com o Simples Nacional.</div>
  const cell = (v: number) => (v > 0.005 ? fmtBRL(v) : "—")
  return (
    <div className="ctbl">
      <div className="ctbl-h"><span>Tributo</span><span>Simples Nacional</span><span>Lucro Presumido</span></div>
      {comp.linhas.map((l) => (
        <div className="ctbl-r" key={l.tributo}><span>{l.tributo}</span><span className="num">{cell(l.simples)}</span><span className="num">{cell(l.presumido)}</span></div>
      ))}
      <div className="ctbl-t"><span>Total de impostos</span><span className="num">{fmtBRL(comp.totalSimples)}</span><span className="num">{fmtBRL(comp.totalPresumido)}</span></div>
      <div className="ctbl-eco">{comp.economia < 0.5
        ? <>Carga equivalente nos dois regimes.</>
        : comp.melhor === comp.atual
          ? <>O regime atual (<b>{comp.melhor}</b>) é o de menor carga — <b>{fmtBRL(comp.economia)}/mês</b> a menos.</>
          : <>Para referência: no <b>{comp.melhor}</b> a carga seria <b>{fmtBRL(comp.economia)}/mês</b> menor.</>}</div>
    </div>
  )
}

interface DueGroup { date: string; day: string; mo: string; diff: number; items: TaxRow[]; total: number }
function diffLabel(d: number) { return d < 0 ? "vencido" : d === 0 ? "hoje" : d <= 5 ? `${d} dias` : "a vencer" }

function VencCell({ g }: { g: DueGroup }) {
  const hl = g.diff < 0 || g.diff <= 5
  return (
    <div className={"vrow" + (hl ? " hl" : "")}>
      <div className="vd">{g.day}<small>{g.mo.toUpperCase()}</small></div>
      <div className="vx"><div className="vn">{g.items.map((t) => t.tax).join(" + ")}</div><div className="vsub num">{fmtBRL(g.total)}</div></div>
      <div className="vtag">{diffLabel(g.diff)}</div>
    </div>
  )
}

interface VItem { kind: "pay" | "acc" | "tot"; day?: string; mo?: string; name: string; sub: string; value?: number; tag?: string; hl?: boolean }
function VRow({ r }: { r: VItem }) {
  if (r.kind === "tot")
    return <div className="vrow tot"><div className="vx"><div className="vn">{r.name}</div><div className="vsub">{r.sub}</div></div>{r.value != null && <div className="vv">{fmtBRL(r.value)}</div>}</div>
  return (
    <div className={"vrow" + (r.hl ? " hl" : "")}>
      <div className="vd">{r.day}<small>{r.mo}</small></div>
      <div className="vx"><div className="vn">{r.name}</div><div className="vsub">{r.sub}</div></div>
      {r.value != null && <div className="vv">{fmtBRL(r.value)}</div>}
      {r.tag && <div className="vtag">{r.tag}</div>}
    </div>
  )
}

function Calendar({ year, month, payDays }: { year: number; month: number; payDays: Record<number, string> }) {
  const first = (new Date(year, month - 1, 1).getDay() + 6) % 7 // segunda-feira primeiro
  const days = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < first; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return (
    <div className="cal" style={{ flex: 1.55 }}>
      <div className="cal-top"><div className="cal-mon">{MONTHS[month - 1]}</div><div className="cal-yr">{year}</div></div>
      <div className="cal-head">{["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((w) => <span key={w}>{w}</span>)}</div>
      <div className="cal-grid">
        {cells.map((d, i) => {
          const pay = d ? payDays[d] : undefined
          return <div key={i} className={"cell" + (!d ? " mt" : pay ? " pay" : "")}>{d || ""}{pay && <span className="ct">{pay}</span>}</div>
        })}
      </div>
      <div className="cal-lg"><div className="d"><i className="dot-pay" />Guia com pagamento</div></div>
    </div>
  )
}

function Ring({ v, pct, green, greenNum, k, s, pill }: { v: string; pct: number; green?: boolean; greenNum?: boolean; k: React.ReactNode; s: string; pill: { cls: string; txt: string } }) {
  const color = green ? "#5a7c3b" : "#b8902f"
  const p = Math.min(100, Math.max(0, pct)).toFixed(1)
  return (
    <div className="ringc">
      <div className="ring" style={{ background: `conic-gradient(${color} 0 ${p}%,#e7e2d0 ${p}% 100%)` }}>
        <div className={"ring-h" + (greenNum ? " rg-g" : "")}>{v}</div>
      </div>
      <div className="ring-k">{k}</div>
      <div className="ring-s">{s}</div>
      <div className="ring-pill"><span className={"pill " + pill.cls}>{pill.txt}</span></div>
    </div>
  )
}
function DtlRow({ l, sub, v, up }: { l: string; sub: string; v: string; up?: string }) {
  return <div className="dtl-row"><div className="dtl-l">{l}<small>{sub}</small></div><div className="dtl-v">{v}{up && <span className="upx">{up}</span>}</div></div>
}
function MetricCard({ k, v, s, up }: { k: string; v: string; s?: string; up?: string }) {
  return <div className="dcard"><div className="dc-k">{k}</div><div className="dc-v">{v}{up && <span className="dc-up">{up}</span>}</div>{s && <div className="dc-s">{s}</div>}</div>
}
function GoldEconomia({ economiaMes, sub, note }: { economiaMes: number; sub?: string; note?: React.ReactNode }) {
  return (
    <div className="goldpanel">
      <div className="gp-l">
        <div className="gp-big"><span className="rs" style={{ fontSize: 16 }}>R$</span><span className="n">{fmtK(economiaMes)}</span>/mês</div>
        {sub && <div className="gp-sub">{sub}</div>}
      </div>
      {note && <div className="gp-note">{note}</div>}
    </div>
  )
}

/* ===================== Componente principal ===================== */
export interface RelatorioMensalProps { cd: ClientData; ap: Apuracao; evolution: HistPoint[]; params?: ParametrosFiscais }

export function RelatorioMensal({ cd, ap, evolution, params = PARAMETROS_PADRAO }: RelatorioMensalProps) {
  const isSN = !!ap.sn
  const monthName = cd.compMonth ? MONTHS[parseInt(cd.compMonth) - 1] : ""
  const compPretty = monthName ? `${monthName} / ${cd.compYear}` : cd.competenceShort || "—"
  const curMonth = cd.compMonth ? parseInt(cd.compMonth) : 0
  const curYear = cd.compYear || String(new Date().getFullYear())
  const today = new Date().toLocaleDateString("pt-BR")
  const anexoFaixa = isSN ? `${ap.sn!.anexoEf} · ${ap.sn!.faixa}ª faixa` : ap.atividade

  const taxesPos = ap.taxes.filter((t) => parseBR(t.value) > 0)
  // Composição: guias realmente apuradas no mês (uma fatia por guia), sem abrir o
  // DAS na repartição teórica e sem guias manuais. Soma bate com o KPI "Impostos".
  const compSegs: Seg[] = capSegs((() => {
    // MEI tem uma única guia (DAS-MEI); manter a abertura informativa não duplica.
    if (ap.mei) return ap.mei.repart.map((r) => ({ label: r.tax, value: r.value })).filter((s) => s.value > 0)
    // Simples, Lucro Presumido e Lucro Real: uma fatia por guia que conta na
    // competência (guias do motor + manuais que o usuário incluiu). Parcelamentos e
    // pendências de meses anteriores ficam de fora — batem com o KPI "Impostos".
    return ap.taxes
      .filter((t) => t.contaCompetencia && parseBR(t.value) > 0)
      .map((t) => ({ label: t.tax, value: parseBR(t.value) }))
      .sort((a, b) => b.value - a.value)
  })())
  // impostosMes: tributos próprios da competência (carga, rosca, KPI "Impostos", parecer).
  // totalRecolher: tudo que vence no mês, incl. parcelamentos (agenda / "Total a recolher").
  const impostosMes = ap.totPagarMes
  const totalRecolher = ap.totPagar
  const taxesMes = ap.taxes.filter((t) => !t.manual && parseBR(t.value) > 0) // guias do mês (contagem/parecer)
  const liquido = ap.revenue - impostosMes
  // Pendências (débitos em aberto) — informativas, NÃO entram no total/carga.
  const pendencias = cd.pendencias || []
  const pendTotal = pendencias.reduce((s, p) => s + parseBR(p.valor || "0"), 0)
  // Pendências que viraram guia neste mês (entram no Total a recolher).
  const pendComGuia = pendencias.filter((p) => p.emitiuGuia && parseBR(p.valor || "0") > 0).length

  // Comparativo de regimes (informativo — total que pagaria em cada regime).
  // Memoizado: simularComparativo chama computeApuracao 1–2× extra; só recalcula quando muda cd/ap/params.
  const comp = useMemo(() => simularComparativo(cd, ap, params), [cd, ap, params])
  const outroRegime = comp.atual === "Simples Nacional" ? "Lucro Presumido" : "Simples Nacional"
  const maxReg = Math.max(comp.totalSimples, comp.totalPresumido, 1)

  // ECONOMIA REAL gerada pela empresa: Fator R (Anexo III) + segregação
  // (PIS/COFINS monofásico / ICMS-ST que reduz o DAS) + equiparação hospitalar.
  const ecoFatorR = ap.economias.find((e) => e.tipo === "fatorr" && e.atingiu && e.valor > 0)?.valor || 0
  // Segregação (PIS/COFINS monofásico + ICMS-ST) só existe em comércio (Anexo I) e
  // indústria (Anexo II). Em serviços (III/IV/V) não há, então a economia é 0.
  const anexoEf = ap.sn?.anexoEf
  const segregavel = anexoEf === "Anexo I" || anexoEf === "Anexo II"
  const ecoSeg = ap.sn && segregavel ? Math.max(0, ap.sn.dasNominal - ap.sn.das) : 0
  const ecoHosp = ap.economias.find((e) => e.tipo === "hospitalar" && e.valor > 0)?.valor || 0
  const economiaMes = ecoFatorR + ecoSeg + ecoHosp
  const ecoFontes: string[] = []
  if (ecoFatorR > 0) ecoFontes.push("Fator R")
  if (ecoSeg > 0) ecoFontes.push("monofásico / ICMS-ST")
  if (ecoHosp > 0) ecoFontes.push("equiparação hospitalar")
  const ecoLabel = ecoFontes.join(" + ") || "economia tributária"
  const showEco = economiaMes > 0.5
  const ecoPct = impostosMes + economiaMes > 0 ? (economiaMes / (impostosMes + economiaMes)) * 100 : 0

  const curKey = curYear && curMonth ? curYear + "-" + String(curMonth).padStart(2, "0") : ""
  const evo = (evolution || []).slice().sort((a, b) => a.key.localeCompare(b.key))
  const hasEvo = evo.length >= 2
  const growth = hasEvo && evo[0].faturamento > 0 ? ((evo[evo.length - 1].faturamento - evo[0].faturamento) / evo[0].faturamento) * 100 : 0
  const idxCur = evo.findIndex((e) => e.key === curKey)
  const fatTrend = idxCur > 0 && evo[idxCur - 1].faturamento > 0 ? ((ap.revenue - evo[idxCur - 1].faturamento) / evo[idxCur - 1].faturamento) * 100 : null
  const fatAcum12m = isSN && ap.sn!.rbt12 > 0 ? ap.sn!.rbt12 : evo.reduce((s, e) => s + (e.faturamento || 0), 0) || ap.revenue * 12

  const monthlyEcon: number[] = Array(12).fill(0)
  evo.filter((e) => e.key.startsWith(curYear)).forEach((e) => { const mi = parseInt(e.key.slice(5)) - 1; if (mi >= 0 && mi < 12) monthlyEcon[mi] = e.economia || 0 })
  if (curMonth) monthlyEcon[curMonth - 1] = monthlyEcon[curMonth - 1] || economiaMes
  const economiaAno = (() => { let c = 0; for (let i = 0; i < (curMonth || 1); i++) c += monthlyEcon[i]; return c })()
  // "acumulado no ano" só faz sentido com meses anteriores salvos (senão = o do mês)
  const temAcumulado = economiaAno > economiaMes + 0.005
  const economiaNote: React.ReactNode = <>
    {ecoFatorR > 0 && <div>Com <b>Fator R ≥ 28%</b>, a empresa é tributada no <b>Anexo III</b> — alíquota menor que o Anexo V.</div>}
    {ecoSeg > 0 && <div>Produtos com <b>PIS/COFINS monofásico</b> e/ou <b>ICMS-ST</b> já foram tributados na origem, <b>reduzindo o DAS</b> do mês.</div>}
    {ecoHosp > 0 && <div>Presunção reduzida de IRPJ/CSLL por <b>serviço hospitalar/equiparado</b>.</div>}
  </>
  const folgaSimples = Math.max(0, (TETO_SIMPLES - fatAcum12m) / TETO_SIMPLES) * 100
  const ticket = cd.numNotas && parseBR(cd.numNotas) > 0 ? ap.revenue / parseBR(cd.numNotas) : 0

  // vencimentos agrupados por data
  const withDue = taxesPos.filter((t) => t.dueDate)
  const groupMap: Record<string, TaxRow[]> = {}
  withDue.forEach((t) => { (groupMap[t.dueDate] = groupMap[t.dueDate] || []).push(t) })
  const dayInfo = (s: string) => {
    const p = s.split("/"); const d = new Date(+p[2], +p[1] - 1, +p[0]); const t = new Date(); t.setHours(0, 0, 0, 0)
    return { day: p[0], mo: MONTHS_SHORT[+p[1] - 1], diff: Math.ceil((d.getTime() - t.getTime()) / 86400000) }
  }
  const dueGroups: DueGroup[] = Object.entries(groupMap)
    .map(([date, items]) => ({ date, ...dayInfo(date), items, total: items.reduce((s, t) => s + parseBR(t.value), 0) }))
    .sort((a, b) => { const pa = a.date.split("/"), pb = b.date.split("/"); return new Date(+pa[2], +pa[1] - 1, +pa[0]).getTime() - new Date(+pb[2], +pb[1] - 1, +pb[0]).getTime() })
  const nextDue = dueGroups.find((g) => g.diff >= 0) || dueGroups[0]

  // mês-alvo do calendário (mês de pagamento)
  const monthCount: Record<string, number> = {}
  dueGroups.forEach((g) => { const p = g.date.split("/"); monthCount[p[2] + "-" + p[1]] = (monthCount[p[2] + "-" + p[1]] || 0) + 1 })
  const targetKey = Object.entries(monthCount).sort((a, b) => b[1] - a[1])[0]?.[0]
  const [calY, calM] = targetKey ? targetKey.split("-").map(Number) : [curYear ? +curYear : new Date().getFullYear(), curMonth + 1 > 12 ? 1 : curMonth + 1]
  // calendário: dias com pagamento (somente impostos/guias — sem acessórias)
  const payDays: Record<number, string> = {}
  dueGroups.forEach((g) => {
    const p = g.date.split("/")
    if (+p[2] === calY && +p[1] === calM) {
      const tags = g.items.map((t) => itemTag(t)).filter(uniq)
      payDays[+p[0]] = tags.length > 2 ? tags.slice(0, 2).join(" · ") + " +" + (tags.length - 2) : tags.join(" · ")
    }
  })

  // lista de vencimentos (paginável)
  const payRows: VItem[] = dueGroups.map((g) => {
    const parc = g.items.find((t) => t.group === "Parcelamento" && t.parcela)
    const tags = g.items.map((t) => itemTag(t)).filter(uniq).join(" · ")
    return {
      kind: "pay" as const, day: g.day, mo: g.mo.toUpperCase(), name: g.items.map((t) => t.tax).join(" + "),
      sub: tags + (parc ? ` · parcela ${parc.parcela}` : isSN ? " · comp. " + monthName.toLowerCase() : ""),
      value: g.total, tag: diffLabel(g.diff), hl: g.diff < 0 || g.diff <= 5,
    }
  })
  const totalRow: VItem = { kind: "tot", name: "Total a recolher", sub: `${withDue.length} guia${withDue.length !== 1 ? "s" : ""} · ${dueGroups.length} vencimento${dueGroups.length !== 1 ? "s" : ""} · ${MONTHS[calM - 1].toLowerCase()}`, value: totalRecolher }
  const allV: VItem[] = [...payRows, totalRow]

  // paginação: 1ª página da Agenda (ao lado do calendário) leva FIRST itens; o resto vai p/ continuações
  const FIRST = 5, CONT = 14
  const firstChunk = allV.slice(0, FIRST)
  const rest = allV.slice(FIRST)
  const contChunks: VItem[][] = []
  for (let i = 0; i < rest.length; i += CONT) contChunks.push(rest.slice(i, i + CONT))

  // observações: página(s) dedicada(s), paginadas p/ nunca estourar
  const obsChunks = cd.observacoes && cd.observacoes.trim() ? chunkObs(cd.observacoes.trim()) : []

  // numeração: Carga(1) · Agenda(2) · continuações · Indicadores · Observações
  const contCount = contChunks.length
  const pendChunks = chunkArr(pendencias, 16)
  const showPend = pendChunks.length > 0
  // ordem: Carga(1) · [Comparativo] · Agenda · [continuações] · [Pendências] · Resumo · [Observações]
  const showComp = comp.simulavel
  const pgComp = showComp ? 2 : 0
  const pgAgenda = showComp ? 3 : 2
  const pgCont = (ci: number) => pgAgenda + 1 + ci
  const pgPend = (pi: number) => pgAgenda + 1 + contCount + pi
  const pgIndic = pgAgenda + 1 + contCount + pendChunks.length
  const pgObs = (oi: number) => pgIndic + 1 + oi
  const totalPg = pgIndic + obsChunks.length

  // ----- Dados derivados para o parecer da competência -----
  const pct1 = (n: number) => n.toFixed(1).replace(".", ",") + "%"
  const pct2 = (n: number) => n.toFixed(2).replace(".", ",") + "%"
  // Fator R (só Simples sujeito ao Fator R)
  const sujeitoFatorR = !!cd.sujeitoFatorR
  const fatorR = ap.sn?.fatorR ?? 0
  const rbt12 = ap.sn?.rbt12 ?? 0
  const folha12 = ap.sn?.folha12 ?? 0
  const fatorRAtingiu = sujeitoFatorR && fatorR >= 28
  // Folha somada ao pró-labore que ainda falta p/ alcançar 28% do RBT12 (Anexo III).
  const folhaFaltante = Math.max(0, 0.28 * rbt12 - folha12)
  // Pró-labore e suas guias do mês
  const proLaboreVal = parseBR(cd.proLabore)
  const temProLabore = proLaboreVal > 0
  const inssPro = ap.taxes.find((t) => t.tax === "INSS (Pró-labore)")
  const irrfPro = ap.taxes.find((t) => t.tax === "IRRF (Pró-labore)")
  // Guias vencidas (na agenda do mês)
  const vencidas = dueGroups.filter((g) => g.diff < 0)
  const vencidasTot = vencidas.reduce((s, g) => s + g.total, 0)
  const vencidasQtd = vencidas.reduce((s, g) => s + g.items.length, 0)
  // Parcelamentos: desembolso de competências anteriores (fora da carga do mês)
  const parcelas = ap.taxes.filter((t) => t.group === "Parcelamento")
  const parcelasTot = parcelas.reduce((s, t) => s + parseBR(t.value), 0)
  const parcelasNum = parcelas.length
  // Retenções na fonte
  const temRetencao = ap.totRetido > 0.005
  // Três maiores itens da composição (concentração da carga)
  const topComp = [...compSegs].sort((a, b) => b.value - a.value).slice(0, 3)

  const clientCols = [
    { k: "Cliente", v: cd.clientName || "—" },
    { k: "CNPJ", v: cd.cnpj || "—" },
    { k: "Regime", v: ap.regime },
    { k: isSN ? "Anexo" : "Atividade", v: anexoFaixa },
  ]

  // Lista "Guias a recolher no mês" (rodapé da pág. 1): tudo que sai do caixa no mês
  // (motor + manuais + parcelamentos + pendências com guia). 1 coluna até 6 guias;
  // acima, 2 colunas p/ caber mais sem estourar o A4. O excedente vai p/ a Agenda
  // Fiscal (que pagina). Documenta o que o cliente tem a recolher.
  const GUIAS_1COL = 6
  const GUIAS_2COL = 14
  const guiasDuasColunas = taxesPos.length > GUIAS_1COL
  const guiasCap = guiasDuasColunas ? GUIAS_2COL : GUIAS_1COL
  const guiasPreview = taxesPos.slice(0, guiasCap)
  const guiasResto = taxesPos.length - guiasPreview.length

  // ---------- COMPETÊNCIA SEM MOVIMENTO ----------
  // Sem faturamento e sem nenhuma guia a recolher (empresa parada no mês). Em vez das
  // páginas do relatório (medidor/composição/agenda vazios), gera UMA página enxuta:
  // declaração de que não houve apuração e as obrigações acessórias estão em dia.
  const semMovimento = ap.revenue <= 0 && taxesPos.length === 0
  if (semMovimento) {
    const nome = cd.clientName || "—"
    const ehServico = ap.atividade === "Serviços"
    const isSimei = ap.regime === "Simples Nacional" || ap.regime === "MEI"
    const semMovCols = [
      { k: "Cliente", v: nome },
      { k: "CNPJ", v: cd.cnpj || "—" },
      { k: "Regime", v: ap.regime + (isSN ? ` · ${ap.sn!.anexoEf}` : "") },
      { k: "Competência", v: compPretty },
    ]
    return (
      <div className="gn-doc" id="rep-overlay">
        <style dangerouslySetInnerHTML={{ __html: STYLE }} />
        <section className="page sheet">
          <Header title="Competência sem Movimento" comp={<>Competência <b>{compPretty}</b></>} />
          <div className="main"><div className="stack">
            <ClientBar cols={semMovCols} />
            <div className="sec"><Slab>Situação da competência</Slab>
              <div className="kpis" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
                <Kpi k="Faturamento" v={<RS v={0} />} s="sem receita no mês" />
                <Kpi k="Impostos a recolher" v={<RS v={0} />} s="nada a recolher" />
                <Kpi hl k="Situação" v="Sem movimento" s="acessórias em dia" />
              </div>
            </div>
            <div className="sec" style={{ flex: 1 }}><Slab>Parecer da competência</Slab>
              <div className="exsum">
                <p>Na competência <b>{compPretty}</b>, a empresa <b>{nome}</b> ({ap.regime}{isSN ? `, ${ap.sn!.anexoEf}` : ""}) não registrou faturamento{ehServico ? " referente à prestação de serviços" : ""}, não havendo, portanto, imposto{isSimei ? " (DAS)" : ""} a recolher no período.</p>
                <p>{isSimei
                  ? <>As obrigações acessórias foram devidamente transmitidas ao Fisco dentro do prazo legal, conforme a <b>Resolução CGSN nº 140/2018</b>.</>
                  : <>As obrigações acessórias do período foram cumpridas dentro do prazo legal estabelecido pela legislação vigente.</>}</p>
                {obsChunks.length > 0 && <p style={{ whiteSpace: "pre-wrap" }}>{cd.observacoes!.trim()}</p>}
                <p className="exsum-sign">{ESCRITORIO.nome}</p>
              </div>
            </div>
          </div>
            <Footer note="Documento gerado eletronicamente · Pág. 1 de 1" />
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="gn-doc" id="rep-overlay">
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />

      {/* ============ 1 · CARGA TRIBUTÁRIA ============ */}
      <section className="page sheet">
        <Header title="Carga Tributária" comp={<>Competência <b>{compPretty}</b></>} />
        <div className="main"><div className="stack">
          <ClientBar cols={clientCols} />
          <div className="sec"><Slab>Medidor de carga &amp; composição</Slab>
            <div className="fx gap10" style={{ flex: 1, minHeight: 0 }}>
              <div className="panel f1 fx col">
                <div className="slab" style={{ marginBottom: 2 }}><span style={{ color: "var(--muted)", letterSpacing: ".16em" }}>Carga tributária efetiva</span></div>
                <Gauge value={ap.aliqEfetiva} />
                <div className="g-note">{showEco && comp.melhor === comp.atual && ap.revenue > 0
                  ? <>Carga <b style={{ color: "var(--num)" }}>abaixo</b> do {outroRegime} (≈ {(((comp.atual === "Simples Nacional" ? comp.totalPresumido : comp.totalSimples) / ap.revenue) * 100).toFixed(2).replace(".", ",")}%) para o mesmo faturamento.</>
                  : "Tributos efetivos sobre o faturamento do mês."}</div>
              </div>
              <div className="panel f1 fx col">
                <div className="slab" style={{ marginBottom: 4 }}><span style={{ color: "var(--muted)", letterSpacing: ".16em" }}>Composição dos tributos</span></div>
                {compSegs.length ? <Donut segs={compSegs} total={impostosMes} /> : <div className="g-note">Sem tributos apurados.</div>}
              </div>
            </div>
          </div>
          <div className="sec"><Slab>Indicadores do mês</Slab>
            <div className="kpis">
              <Kpi k="Faturamento" v={<RS v={ap.revenue} />} s={fatTrend != null ? <><span className="up">▲ {Math.abs(fatTrend).toFixed(1).replace(".", ",")}%</span> vs. mês ant.</> : "bruto do mês"} />
              <Kpi k="Impostos" v={<RS v={impostosMes} />} s={`${taxesMes.length} guia${taxesMes.length !== 1 ? "s" : ""} no mês`} />
              {showEco
                ? <Kpi hl k="Economia" v={<RS v={economiaMes} />} s={ecoLabel} />
                : <Kpi k="Carga efetiva" v={fmtPct(ap.aliqEfetiva)} s="s/ faturamento" />}
              {showEco && temAcumulado
                ? <Kpi k="Economia no ano" v={<RS v={economiaAno} />} s="acum. no ano" />
                : <Kpi k="Líquido de tributos" v={<RS v={liquido} />} s={`${(ap.revenue > 0 ? (liquido / ap.revenue) * 100 : 0).toFixed(1).replace(".", ",")}% do faturamento`} />}
            </div>
          </div>
          {showEco && (
            <div className="sec"><Slab>Economia tributária gerada</Slab>
              <GoldEconomia economiaMes={economiaMes} sub={temAcumulado ? `${fmtBRL(economiaAno)} acumulado no ano` : undefined} note={economiaNote} />
            </div>
          )}
          {guiasPreview.length > 0 && (
            <div className="sec"><Slab>Guias a recolher no mês</Slab>
              <div className="gmwrap">
                <div className={"gmgrid" + (guiasDuasColunas ? " two" : "")}>
                  {guiasPreview.map((t, i) => {
                    const tag = t.group === "Parcelamento" ? "PARC" : t.group === "Pendência" ? "DÉBITO" : guiaTag(t.tax)
                    const chip = "gm-chip" + (t.group === "Parcelamento" ? " parc" : t.group === "Pendência" ? " pend" : "")
                    // Em 2 colunas com total ímpar, a última guia ocupa a linha inteira p/
                    // fechar o retângulo (grid simétrico, sem célula solta).
                    const isFull = guiasDuasColunas && guiasPreview.length % 2 === 1 && i === guiasPreview.length - 1
                    const cls = "gmrow"
                      + (i >= (guiasDuasColunas ? 2 : 1) ? " brd" : "")
                      + (guiasDuasColunas && !isFull && i % 2 === 1 ? " colr" : "")
                      + (isFull ? " full" : "")
                    return (
                      <div className={cls} key={i}>
                        <span className={chip}>{tag}</span>
                        <div className="gm-main">
                          <div className="gm-tax">{t.tax}{t.parcela ? <span className="gm-pc"> · parc. {t.parcela}</span> : null}</div>
                          <div className="gm-sub">vence {t.dueDate || "—"}</div>
                        </div>
                        <div className="gm-val num">{fmtBRL(parseBR(t.value))}</div>
                      </div>
                    )
                  })}
                </div>
                {guiasResto > 0 && <div className="gm-more">…e mais {guiasResto} guia{guiasResto > 1 ? "s" : ""} — detalhadas na Agenda Fiscal</div>}
                <div className="gm-totrow"><span className="l">Total a recolher</span><span className="v">{fmtBRL(totalRecolher)}</span></div>
              </div>
            </div>
          )}
        </div>
          <Footer note={`Documento gerado eletronicamente · Pág. 1 de ${totalPg}`} />
        </div>
      </section>

      {/* ============ 1b · COMPARATIVO DE REGIMES ============ */}
      {showComp && (
        <section className="page sheet">
          <Header eyebrow="Comparativo" title="Comparativo de Regimes" comp={<>Competência <b>{compPretty}</b></>} />
          <div className="main"><div className="stack">
            <ClientBar cols={[clientCols[0], clientCols[1], clientCols[2], { k: isSN ? "Anexo" : "Atividade", v: anexoFaixa }]} />
            <div className={"cmp-hero" + (comp.melhor === comp.atual ? " good" : "")}>
              <div className="cmp-hero-l">
                <div className="cmp-hero-k">Menor carga tributária</div>
                <div className="cmp-hero-v">{comp.melhor}</div>
                <div className="cmp-hero-sub">{comp.melhor === comp.atual ? "regime atual da empresa" : "frente ao regime atual"}</div>
              </div>
              <div className="cmp-hero-r">
                <div className="cmp-hero-eco"><span className="rs">R$</span>{fmtK(comp.economia)}<small>/mês</small></div>
                <div className="cmp-hero-sub">{comp.melhor === comp.atual ? `de economia vs. ${outroRegime}` : `a menos que o regime atual`}</div>
              </div>
            </div>
            <div className="sec"><Slab>Total de impostos por regime</Slab>
              <div className="cmp">
                <CmpRow name="Simples Nacional" cls="f-green" w={(comp.totalSimples / maxReg) * 100} val={fmtBRL(comp.totalSimples)} />
                <CmpRow name="Lucro Presumido" cls="f-gold" w={(comp.totalPresumido / maxReg) * 100} val={fmtBRL(comp.totalPresumido)} />
              </div>
              {comp.estimado && <div className="cmp-est">Comparativo <b>aproximado</b>: em comércio/indústria o ICMS depende dos créditos de entrada e da substituição tributária. {isSN ? <>O ICMS do Lucro Presumido foi <b>estimado em {fmtPct(parseBR(cd.icmsCompPct))}</b> sobre as vendas.</> : <>Usado o ICMS informado na apuração.</>}</div>}
            </div>
            <div className="sec" style={{ flex: 1 }}><Slab>Detalhamento tributo a tributo</Slab>
              <CompTable comp={comp} />
            </div>
          </div>
            <Footer note={`Comparativo de regimes · Pág. ${pgComp} de ${totalPg}`} />
          </div>
        </section>
      )}

      {/* ============ 2 · AGENDA FISCAL ============ */}
      <section className="page sheet">
        <Header title="Agenda Fiscal" comp={<>Obrigações de <b>{MONTHS[calM - 1]} / {calY}</b></>} />
        <div className="main"><div className="stack">
          <ClientBar cols={[clientCols[0], clientCols[1], clientCols[2], { k: "Competência", v: compPretty }]} />
          <div className="sec"><Slab>Resumo das obrigações</Slab>
            <div className="kpis">
              <Kpi k="Total a recolher" v={<RS v={totalRecolher} />} s={`em ${MONTHS[calM - 1].toLowerCase()}`} />
              <Kpi k="Guias do mês" v={String(withDue.length)} s={`${dueGroups.length} vencimento${dueGroups.length !== 1 ? "s" : ""}`} />
              <Kpi hl k="Próximo vencimento" v={nextDue ? <>{nextDue.day}/{nextDue.mo}</> : "—"} s={nextDue ? diffLabel(nextDue.diff) : "sem guias"} />
              {showEco
                ? <Kpi k="Economia" v={<RS v={economiaMes} />} s={ecoLabel} />
                : <Kpi k="Carga efetiva" v={fmtPct(ap.aliqEfetiva)} s="s/ faturamento" />}
            </div>
          </div>
          <div className="sec" style={{ flex: 1 }}><Slab>Calendário de vencimentos</Slab>
            <div className="fx col gap10" style={{ flex: 1, minHeight: 0 }}>
              <Calendar year={calY} month={calM} payDays={payDays} />
              <div className="vlist" style={{ flexShrink: 0 }}>{firstChunk.map((r, i) => <VRow key={i} r={r} />)}</div>
            </div>
          </div>
        </div>
          <Footer note={`Datas sujeitas a antecipação em feriados · Pág. ${pgAgenda} de ${totalPg}`} />
        </div>
      </section>

      {/* ============ 2b · AGENDA (CONTINUAÇÃO) ============ */}
      {contChunks.map((chunk, ci) => (
        <section className="page sheet" key={"c" + ci}>
          <Header eyebrow="Continuação" title="Agenda Fiscal" comp={<>Vencimentos (cont.) · <b>{MONTHS[calM - 1]} / {calY}</b></>} />
          <div className="main"><div className="stack">
            <div className="sec" style={{ flex: 1 }}><Slab>Vencimentos — continuação ({ci + 2}/{contChunks.length + 1})</Slab>
              <div className="vlist">{chunk.map((r, i) => <VRow key={i} r={r} />)}</div>
            </div>
          </div>
            <Footer note={`Continuação da agenda fiscal · Pág. ${pgCont(ci)} de ${totalPg}`} />
          </div>
        </section>
      ))}

      {/* ============ 2c · PENDÊNCIAS / DÉBITOS EM ABERTO (página dedicada) ============ */}
      {showPend && pendChunks.map((chunk, pi) => (
        <section className="page sheet" key={"pd" + pi}>
          <Header eyebrow="Pendências" title="Débitos em Aberto"
            comp={<>Competência <b>{compPretty}</b>{pendChunks.length > 1 ? ` · ${pi + 1}/${pendChunks.length}` : ""}</>} />
          <div className="main"><div className="stack">
            {pi === 0 && (
              <div className="pend-hero">
                <div>
                  <div className="pend-hero-k">Total de débitos em aberto</div>
                  <div className="pend-hero-sub">{pendencias.length} débito{pendencias.length !== 1 ? "s" : ""}{pendComGuia > 0 ? ` · ${pendComGuia} com guia emitida (no total do mês)` : " · informativo — não compõem o total do mês"}</div>
                </div>
                <div className="pend-hero-v"><span className="rs">R$</span>{fmtK(pendTotal)}</div>
              </div>
            )}
            <div className="sec" style={{ flex: 1 }}><Slab>Relação de débitos</Slab>
              <div className="ptbl">
                <div className="ptbl-h"><span>Descrição</span><span>Competência</span><span>Situação</span><span className="r">Valor</span></div>
                {chunk.map((p, i) => (
                  <div className="ptbl-r" key={i}>
                    <span className="ptbl-d">{p.descricao}{p.emitiuGuia && <span className="ptbl-g">guia emitida</span>}</span>
                    <span>{p.competencia || "—"}</span>
                    <span className="ptbl-s">{p.situacao || "—"}</span>
                    <span className="r">{p.valor ? fmtBRL(parseBR(p.valor)) : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
            <Footer note={`Débitos em aberto — regularizar junto à Receita / órgão · Pág. ${pgPend(pi)} de ${totalPg}`} />
          </div>
        </section>
      ))}

      {/* ============ 3 · INDICADORES FISCAIS ============ */}
      <section className="page sheet">
        <Header title="Resumo Executivo" comp={<>Competência <b>{compPretty}</b></>} />
        <div className="main"><div className="stack">
          <ClientBar cols={[clientCols[0], clientCols[1], clientCols[2], { k: "Carga efetiva", v: `${fmtPct(ap.aliqEfetiva)} s/ faturamento` }]} />
          <div className="sec" style={{ flex: 1 }}><Slab>Parecer da competência</Slab>
            <div className="exsum">
              {/* 1 · Abertura */}
              <p>Na competência <b>{compPretty}</b>, a empresa <b>{cd.clientName || "—"}</b> ({ap.regime}{isSN ? `, ${anexoFaixa}` : ""}) apurou faturamento bruto de <b>{fmtBRL(ap.revenue)}</b>, sobre o qual incide carga tributária efetiva de <b>{fmtPct(ap.aliqEfetiva)}</b> ({fmtBRL(impostosMes)} em tributos do mês, distribuídos em {taxesMes.length} guia{taxesMes.length !== 1 ? "s" : ""}). O valor líquido após impostos é de <b>{fmtBRL(liquido)}</b> ({pct1(ap.revenue > 0 ? (liquido / ap.revenue) * 100 : 0)} do faturamento).</p>
              {/* 2 · Concentração da carga */}
              {topComp.length > 0 && <p>A carga do mês concentra-se em {topComp.map((s) => `${s.label} (${pct1(impostosMes > 0 ? (s.value / impostosMes) * 100 : 0)})`).join(", ")}, que respondem pela maior parcela do recolhimento da competência.</p>}
              {/* 3 · Economia */}
              {showEco && <p>A apuração gerou <b>economia tributária de {fmtBRL(economiaMes)}</b>{temAcumulado ? ` (${fmtBRL(economiaAno)} acumulados no ano)` : ""}, decorrente de {ecoLabel}, benefício já refletido no valor recolhido na competência.</p>}
              {/* 4 · Fator R */}
              {sujeitoFatorR && fatorRAtingiu && <p>Com Fator R de <b>{pct2(fatorR)}</b> (≥ 28%), a empresa é enquadrada no <b>Anexo III</b>, de alíquota menor que o Anexo V{ecoFatorR > 0 ? <>, o que representa economia de <b>{fmtBRL(ecoFatorR)}</b> no DAS frente ao Anexo V</> : null}.</p>}
              {sujeitoFatorR && !fatorRAtingiu && <p>O Fator R de <b>{pct2(fatorR)}</b> (abaixo de 28%) mantém a empresa no <b>Anexo V</b>, de alíquota maior. {folhaFaltante > 0 ? <>Para alcançar os 28% do RBT12 e migrar ao Anexo III seriam necessários cerca de <b>{fmtBRL(folhaFaltante)}</b> a mais de folha somada ao pró-labore nos últimos 12 meses, o que reduziria o DAS.</> : <>O aumento da folha somada ao pró-labore aproximaria a empresa do Anexo III, reduzindo o DAS.</>}</p>}
              {/* 5 · Teto do Simples */}
              {isSN && <p>O faturamento acumulado em 12 meses soma <b>{fmtBRL(fatAcum12m)}</b>, consumindo {pct1(100 - folgaSimples)} do teto de R$ 4,8 milhões do Simples Nacional, com <b>{pct1(folgaSimples)} de folga</b>. {folgaSimples < 20 ? "A folga está estreita: há aproximação do limite de desenquadramento, recomendando-se acompanhamento mensal do faturamento." : folgaSimples <= 40 ? "A folga pede atenção ao ritmo de faturamento para não se aproximar do limite." : "A situação é confortável frente ao limite de desenquadramento."}</p>}
              {/* 6 · Vencimentos */}
              {vencidas.length > 0
                ? <p>Há <b>{vencidasQtd} guia{vencidasQtd !== 1 ? "s" : ""} vencida{vencidasQtd !== 1 ? "s" : ""}</b> totalizando <b>{fmtBRL(vencidasTot)}</b>. Recomenda-se a regularização imediata (sujeita a multa e juros de mora) para evitar restrições.</p>
                : nextDue ? <p>O próximo vencimento ocorre em <b>{nextDue.day}/{nextDue.mo}</b> ({diffLabel(nextDue.diff)}). Recomenda-se a quitação das guias dentro do prazo legal para evitar multa e juros de mora.</p> : null}
              {/* 7 · Pró-labore */}
              {temProLabore
                ? <p>Sobre o pró-labore de <b>{fmtBRL(proLaboreVal)}</b> incide o <b>INSS{inssPro ? ` de ${fmtBRL(parseBR(inssPro.value))}` : ""}</b>{irrfPro ? <>, além do <b>IRRF de {fmtBRL(parseBR(irrfPro.value))}</b></> : null}, recolhido na competência.</p>
                : (sujeitoFatorR ? <p>A empresa é sujeita ao Fator R e não possui pró-labore: a adoção de pró-labore eleva a folha considerada no cálculo, sendo um caminho para atingir os 28% e migrar ao Anexo III.</p> : null)}
              {/* 8 · Retenções */}
              {temRetencao && <p>Parte dos tributos foi <b>retida na fonte</b> ({fmtBRL(ap.totRetido)}), antecipando o recolhimento e reduzindo o desembolso efetivo da competência.</p>}
              {/* 9 · Parcelamentos */}
              {parcelasNum > 0 && <p>À parte da carga do mês, há <b>{parcelasNum} parcelamento{parcelasNum !== 1 ? "s" : ""}</b> totalizando <b>{fmtBRL(parcelasTot)}</b>, referentes a desembolsos de competências anteriores. Esses valores integram o total a recolher, mas não compõem a carga tributária efetiva da competência.</p>}
              {/* 10 · Pendências */}
              {showPend && <p>A empresa possui <b>{pendencias.length} débito{pendencias.length !== 1 ? "s" : ""} em aberto</b> totalizando <b>{fmtBRL(pendTotal)}</b> (detalhados na página "Débitos em Aberto"){pendComGuia > 0 ? <>, {pendComGuia === pendencias.length ? "todos" : <><b>{pendComGuia}</b> deles</>} com guia emitida e incluída no total a recolher deste mês</> : null}. Recomenda-se a regularização{pendComGuia > 0 && pendComGuia < pendencias.length ? " dos demais" : ""} para evitar restrições (CND, dívida ativa).</p>}
              {/* 11 · Comparativo de regimes */}
              {comp.simulavel && <p>No comparativo de regimes para o mesmo faturamento, o <b>{comp.melhor}</b> apresenta a menor carga total ({fmtBRL(comp.totalSimples)} no Simples Nacional × {fmtBRL(comp.totalPresumido)} no Lucro Presumido). {comp.melhor === comp.atual ? `O regime atual já é o mais econômico, com vantagem de ${fmtBRL(comp.economia)}/mês.` : `A adoção do ${comp.melhor} reduziria a carga em ${fmtBRL(comp.economia)}/mês (recomenda-se estudo de enquadramento).`}</p>}
              {/* 12 · Assinatura */}
              <p className="exsum-sign">{ESCRITORIO.nome}</p>
            </div>
          </div>
        </div>
          <Footer note={`Emitido em ${today} · Pág. ${pgIndic} de ${totalPg}`} />
        </div>
      </section>

      {/* ============ 4 · OBSERVAÇÕES (página dedicada, paginada) ============ */}
      {obsChunks.map((chunk, oi) => (
        <section className="page sheet" key={"o" + oi}>
          <Header eyebrow="Observações" title="Observações & Recomendações"
            comp={<>Competência <b>{compPretty}</b>{obsChunks.length > 1 ? ` · ${oi + 1}/${obsChunks.length}` : ""}</>} />
          <div className="main"><div className="stack">
            <div className="sec" style={{ flex: 1 }}><Slab>Observações &amp; recomendações</Slab>
              <div className="obsbox" style={{ flex: 1, overflow: "hidden" }}>{chunk}</div>
            </div>
          </div>
            <Footer note={`Observações & recomendações · Pág. ${pgObs(oi)} de ${totalPg}`} />
          </div>
        </section>
      ))}
    </div>
  )
}

/* ===================== CSS (escopado em .gn-doc) ===================== */
const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
.gn-doc{--cream:#faf8f1;--card:#fff;--bd:#e8e3d2;--bd2:#ece7d6;--num:#374a25;--gold:#b0892e;--gold2:#c9a23a;--gold-grad:linear-gradient(120deg,#9c7b2e,#e6cf86 48%,#b8902f 85%);--green-dk:#3f4e2c;--sage:#7c8c5b;--muted:#8f9179;--tint:#f4e9dd;
  background:#52544a;font-family:'IBM Plex Sans',sans-serif;color:#33402a;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:24px 12px;}
.gn-doc *{box-sizing:border-box;margin:0;padding:0}
.gn-doc .fx{display:flex}.gn-doc .col{flex-direction:column}.gn-doc .ac{align-items:center}.gn-doc .jb{justify-content:space-between}
.gn-doc .f1{flex:1}.gn-doc .gap10{gap:10px}.gn-doc .gap16{gap:16px}
.gn-doc .page{width:210mm;height:297mm;background:var(--cream);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.22);margin:0 auto 24px;content-visibility:auto;contain-intrinsic-size:210mm 297mm}
.gn-doc.exporting .page{content-visibility:visible}
.gn-doc .num{font-variant-numeric:tabular-nums}
.gn-doc .hdr{height:30mm;flex:none;background:linear-gradient(100deg,#2c3720,#43532f 58%,#4e603a);display:flex;align-items:center;justify-content:space-between;padding:0 13mm;position:relative}
.gn-doc .hdr-rule{position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--gold-grad)}
.gn-doc .hdr-l{display:flex;align-items:center;gap:13px}
.gn-doc .wm-1{font:500 23px 'Jost';letter-spacing:.05em;line-height:1;background:var(--gold-grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.gn-doc .wm-2{font:400 8px 'Jost';letter-spacing:.42em;color:#aeb39a;margin-top:5px}
.gn-doc .hdr-r{text-align:right}
.gn-doc .h-eye{font:500 8.5px 'Jost';letter-spacing:.32em;text-transform:uppercase;color:#caa84e;margin-bottom:6px}
.gn-doc .h-title{font:500 23px 'Jost';color:#f6f3ea;line-height:1.05}
.gn-doc .h-comp{font:300 11px 'IBM Plex Sans';color:#cfd2bf;margin-top:6px}
.gn-doc .h-comp b{font-weight:600;color:#fff}
.gn-doc .main{flex:1;display:flex;flex-direction:column;padding:6mm 13mm 7mm;min-height:0}
.gn-doc .stack{flex:1;display:flex;flex-direction:column;gap:4.3mm;min-height:0}
.gn-doc .sec{display:flex;flex-direction:column;gap:8px;min-height:0}
.gn-doc .clientbar{display:grid;grid-template-columns:repeat(4,1fr);background:var(--card);border:1px solid var(--bd);border-radius:10px;overflow:hidden;flex:none}
.gn-doc .cb{padding:11px 15px;border-right:1px solid var(--bd2);min-width:0}
.gn-doc .cb.last{border-right:none}
.gn-doc .cb-k{font:500 8px 'Jost';letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:5px}
.gn-doc .cb-v{font:400 12px/1.3 'IBM Plex Sans';color:#334023;overflow-wrap:anywhere;word-break:break-word}
.gn-doc .slab{display:flex;align-items:center;gap:9px}
.gn-doc .dash{width:18px;height:2px;background:var(--gold-grad);display:block;flex:none}
.gn-doc .slab span{font:500 9px 'Jost';letter-spacing:.22em;text-transform:uppercase;color:var(--gold)}
.gn-doc .slab .rt{margin-left:auto}
.gn-doc .clegend{display:flex;gap:15px;align-items:center;font:400 9px 'IBM Plex Sans';color:var(--muted)}
.gn-doc .cl-i{display:flex;align-items:center;gap:6px}
.gn-doc .cl-i i{width:13px;height:3px;border-radius:2px;display:block}
.gn-doc .cl-i .sq{width:10px;height:10px;border-radius:2px}
.gn-doc .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}
.gn-doc .kpi{background:var(--card);border:1px solid var(--bd);border-radius:11px;padding:13px 15px;display:flex;flex-direction:column}
.gn-doc .kpi.hl{background:var(--green-dk);border-color:var(--green-dk)}
.gn-doc .kpi .k{font:500 8px 'Jost';letter-spacing:.15em;text-transform:uppercase;color:var(--gold);margin-bottom:9px}
.gn-doc .kpi.hl .k{color:#c9a85a}
.gn-doc .kpi .v{font:600 22px 'Jost';color:var(--num);line-height:1;font-variant-numeric:tabular-nums}
.gn-doc .kpi.hl .v{color:#f5f1e6}
.gn-doc .rs{font-size:.62em;font-weight:500;color:var(--muted);margin-right:2px}
.gn-doc .kpi.hl .rs{color:#b9c0a3}
.gn-doc .kpi .s{font:400 9px 'IBM Plex Sans';color:var(--muted);margin-top:7px}
.gn-doc .kpi.hl .s{color:#b9c0a3}
.gn-doc .up{color:#5a7c3b;font-weight:600}
.gn-doc .panel{background:var(--card);border:1px solid var(--bd);border-radius:13px;padding:15px 17px}
.gn-doc .gauge{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1}
.gn-doc .g-svg{width:232px;height:150px;display:block}
.gn-doc .g-read{margin-top:-60px;text-align:center}
.gn-doc .g-read b{font:600 42px 'Jost';color:var(--num);line-height:1}
.gn-doc .g-read small{display:block;font:400 10px 'IBM Plex Sans';color:var(--muted);margin-top:3px}
.gn-doc .g-scale{display:flex;justify-content:space-between;width:226px;font:500 8.5px 'IBM Plex Sans';color:var(--muted);margin-top:9px}
.gn-doc .g-note{font:400 10px/1.5 'IBM Plex Sans';color:var(--muted);margin-top:13px;text-align:center;max-width:74mm;align-self:center}
.gn-doc .donut{width:122px;height:122px;border-radius:50%;position:relative;flex:none}
.gn-doc .donut-h{position:absolute;inset:25px;background:var(--card);border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center}
.gn-doc .donut-h b{font:600 18px 'Jost';color:var(--num);line-height:1}
.gn-doc .donut-h small{font:500 7.5px 'Jost';letter-spacing:.18em;color:var(--muted);margin-top:3px}
.gn-doc .leg{display:flex;flex-direction:column;gap:11px;flex:1}
.gn-doc .leg-i{display:flex;align-items:center;gap:10px;font:400 11px 'IBM Plex Sans';color:#334023}
.gn-doc .leg-i i{width:11px;height:11px;border-radius:3px;flex:none}
.gn-doc .leg-lab{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gn-doc .leg-v{font-variant-numeric:tabular-nums;color:var(--muted)}
.gn-doc .leg-p{font:600 11px 'Jost';color:var(--num);min-width:40px;text-align:right;font-variant-numeric:tabular-nums}
.gn-doc .goldpanel{background:#fbf8ee;border:1.5px solid #d9c285;border-radius:14px;padding:15px 20px;display:flex;align-items:center;gap:26px}
.gn-doc .gp-l{flex:none}
.gn-doc .gp-big{font:300 16px 'Jost';color:var(--num)}
.gn-doc .gp-big .n{font:700 36px 'Jost';background:var(--gold-grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.gn-doc .gp-sub{font:400 10px 'IBM Plex Sans';color:var(--muted);margin-top:5px}
.gn-doc .gp-note{flex:1;font:400 11px/1.6 'IBM Plex Sans';color:#56604a}
.gn-doc .gp-note b{color:var(--green-dk);font-weight:600}
.gn-doc .cmp{flex:1;display:flex;flex-direction:column;gap:11px}
.gn-doc .cmp-est{margin-top:11px;background:#fbf6ea;border:1px solid #e6d6a8;border-radius:9px;padding:9px 13px;font:400 9.5px/1.5 'IBM Plex Sans';color:#7a5e1f}
.gn-doc .cmp-est b{font-weight:600;color:#6a4e12}
.gn-doc .cmp-row{display:grid;grid-template-columns:118px 1fr 82px;align-items:center;gap:13px}
.gn-doc .cmp-name{font:400 10.5px 'IBM Plex Sans';color:#334023}
.gn-doc .cmp-track{height:13px;background:#ece7d6;border-radius:7px;overflow:hidden}
.gn-doc .cmp-fill{height:100%;border-radius:7px}
.gn-doc .f-green{background:linear-gradient(90deg,#4f6b34,#5f7d40)}.gn-doc .f-gold{background:var(--gold-grad)}.gn-doc .f-beige{background:#cfc3a0}
.gn-doc .cmp-val{font:600 11.5px 'Jost';color:var(--num);text-align:right;font-variant-numeric:tabular-nums}
.gn-doc .ctbl{display:flex;flex-direction:column;border:1px solid var(--bd);border-radius:12px;overflow:hidden;background:var(--card)}
.gn-doc .ctbl-h,.gn-doc .ctbl-r,.gn-doc .ctbl-t{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:8px;padding:7px 14px;align-items:center}
.gn-doc .ctbl-h{background:#f4f1ea;font:600 8.5px 'Jost';letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.gn-doc .ctbl-h span:not(:first-child),.gn-doc .ctbl .num{text-align:right;font-variant-numeric:tabular-nums}
.gn-doc .ctbl-r{font:400 10.5px 'IBM Plex Sans';color:#334023;border-top:1px solid var(--bd2)}
.gn-doc .ctbl-t{border-top:2px solid var(--bd);font:700 11px 'Jost';color:var(--num);background:#fbf8ee}
.gn-doc .ctbl-eco{padding:9px 14px;background:var(--green-dk);color:#f5f1e6;font:400 10.5px 'IBM Plex Sans';text-align:center}
.gn-doc .ctbl-eco b{color:#fff}
.gn-doc .cmp-hero{display:flex;justify-content:space-between;align-items:center;gap:20px;background:linear-gradient(100deg,#2c3720,#43532f 70%,#4e603a);border-radius:14px;padding:16px 24px;color:#f6f3ea}
.gn-doc .cmp-hero-k{font:500 9px 'Jost';letter-spacing:.22em;text-transform:uppercase;color:#caa84e}
.gn-doc .cmp-hero-v{font:600 23px 'Jost';color:#fff;line-height:1.05;margin-top:5px}
.gn-doc .cmp-hero-r{text-align:right;flex:none}
.gn-doc .cmp-hero-sub{font:400 9.5px 'IBM Plex Sans';color:#cfd2bf;margin-top:5px}
.gn-doc .cmp-hero-eco{font:700 34px 'Jost';color:#e6cf86;line-height:1;font-variant-numeric:tabular-nums}
.gn-doc .cmp-hero-eco .rs{font-size:.5em;font-weight:500;color:#caa84e;margin-right:3px}
.gn-doc .cmp-hero-eco small{font-size:.38em;font-weight:400;color:#cfd2bf;margin-left:3px}
.gn-doc .cal{background:var(--card);border:1px solid var(--bd);border-radius:13px;padding:15px 16px;display:flex;flex-direction:column}
.gn-doc .cal-top{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:11px}
.gn-doc .cal-mon{font:500 17px 'Jost';color:var(--num)}
.gn-doc .cal-yr{font:400 12px 'IBM Plex Sans';color:var(--muted)}
.gn-doc .cal-head{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:6px}
.gn-doc .cal-head span{text-align:center;font:600 8px 'Jost';letter-spacing:.06em;color:var(--muted)}
.gn-doc .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;flex:1}
.gn-doc .cell{border:1px solid var(--bd2);border-radius:8px;padding:6px 8px;display:flex;flex-direction:column;font:500 12px 'IBM Plex Sans';color:#3a4530;min-height:0}
.gn-doc .cell.mt{visibility:hidden;border:none}
.gn-doc .cell.pay{background:var(--tint);border-color:#e6d3b8}
.gn-doc .cell.acc{background:#f6efdd;border-color:#e3d4a6}
.gn-doc .cell .ct{font:700 8px 'Jost';letter-spacing:.02em;text-transform:uppercase;color:var(--gold);margin-top:auto;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gn-doc .cal-lg{display:flex;gap:18px;margin-top:11px;font:400 9px 'IBM Plex Sans';color:var(--muted);align-items:center}
.gn-doc .cal-lg .d{display:flex;align-items:center;gap:7px}
.gn-doc .cal-lg .d i{width:11px;height:11px;border-radius:3px}
.gn-doc .dot-pay{background:var(--tint);border:1px solid #d8b98a}.gn-doc .dot-acc{background:#f6efdd;border:1px solid #e3d4a6}
.gn-doc .vlist{display:flex;flex-direction:column;gap:8px}
.gn-doc .vrow{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:11px 14px}
.gn-doc .vrow.hl{background:var(--tint);border-color:#e6d3b8}
.gn-doc .vrow.tot{background:var(--green-dk);border-color:var(--green-dk)}
.gn-doc .vd{font:700 17px 'Jost';color:var(--num);line-height:.82;text-align:center;flex:none;min-width:24px}
.gn-doc .vd small{display:block;font:500 7px 'Jost';letter-spacing:.08em;color:var(--muted);margin-top:3px}
.gn-doc .vx{flex:1;min-width:0}
.gn-doc .vn{font:600 11px 'IBM Plex Sans';color:#334023;line-height:1.2}
.gn-doc .vsub{font:400 8.5px 'IBM Plex Sans';color:var(--muted);margin-top:2px}
.gn-doc .vv{font:700 12.5px 'Jost';color:var(--num);font-variant-numeric:tabular-nums;flex:none}
.gn-doc .vtag{font:600 7.5px 'Jost';letter-spacing:.08em;text-transform:uppercase;color:var(--gold);flex:none}
.gn-doc .vrow.tot .vd,.gn-doc .vrow.tot .vn,.gn-doc .vrow.tot .vv{color:#f5f1e6}
.gn-doc .vrow.tot .vd small,.gn-doc .vrow.tot .vsub{color:#b9c0a3}
.gn-doc .venc{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
.gn-doc .obsbox{background:var(--card);border:1px solid var(--bd);border-radius:13px;padding:15px 17px;font:400 11px/1.65 'IBM Plex Sans';color:#3a4530;white-space:pre-wrap}
.gn-doc .gmwrap{border:1px solid var(--bd);border-radius:13px;overflow:hidden;background:var(--card)}
.gn-doc .gmgrid{display:flex;flex-direction:column}
.gn-doc .gmgrid.two{display:grid;grid-template-columns:1fr 1fr}
.gn-doc .gmrow{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:8px 15px}
.gn-doc .gmrow.brd{border-top:1px solid var(--bd2)}
.gn-doc .gmrow.colr{border-left:1px solid var(--bd2)}
.gn-doc .gmrow.full{grid-column:1 / -1}
.gn-doc .gm-chip{font:700 7.5px 'Jost';letter-spacing:.07em;text-transform:uppercase;color:#4f6b34;background:#e3ead5;padding:4px 9px;border-radius:7px;min-width:44px;text-align:center;align-self:center}
.gn-doc .gm-chip.parc{color:#9c7a22;background:#f3e9d2}
.gn-doc .gm-chip.pend{color:#a23a2e;background:#fbeae7}
.gn-doc .gm-main{min-width:0}
.gn-doc .gm-tax{font:500 11px 'IBM Plex Sans';color:#334023;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gn-doc .gm-pc{font-weight:400;color:var(--muted)}
.gn-doc .gm-sub{font:400 8.5px 'IBM Plex Sans';color:var(--muted);margin-top:2px}
.gn-doc .gm-val{font:700 12px 'Jost';color:var(--num);text-align:right;font-variant-numeric:tabular-nums}
.gn-doc .gm-more{padding:7px 16px;border-top:1px solid var(--bd2);background:#faf8f1;color:var(--muted);font:400 9px 'IBM Plex Sans';text-align:center}
.gn-doc .gm-totrow{display:flex;justify-content:space-between;align-items:center;padding:11px 18px;background:var(--green-dk)}
.gn-doc .gm-totrow .l{font:600 9px 'Jost';letter-spacing:.16em;text-transform:uppercase;color:#c9a85a}
.gn-doc .gm-totrow .v{font:700 16px 'Jost';color:#f5f1e6;font-variant-numeric:tabular-nums}
.gn-doc .rings{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}
.gn-doc .ringc{background:var(--card);border:1px solid var(--bd);border-radius:13px;padding:15px 12px;display:flex;flex-direction:column;align-items:center;text-align:center}
.gn-doc .ring{width:96px;height:96px;border-radius:50%;position:relative}
.gn-doc .ring-h{position:absolute;inset:11px;background:var(--card);border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 18px 'Jost';color:var(--num);font-variant-numeric:tabular-nums;padding:0 4px;text-align:center}
.gn-doc .rg-g{color:#5a7c3b}
.gn-doc .ring-k{font:600 9px 'Jost';letter-spacing:.06em;text-transform:uppercase;color:#56604a;margin-top:13px;line-height:1.3}
.gn-doc .ring-s{font:400 8.5px 'IBM Plex Sans';color:var(--muted);margin-top:5px}
.gn-doc .ring-pill{margin-top:auto;padding-top:11px}
.gn-doc .pill{display:inline-block;font:600 7.5px 'Jost';letter-spacing:.1em;text-transform:uppercase;padding:4px 9px;border-radius:20px}
.gn-doc .pill.gd{background:#f3e9d2;color:#9c7a22}.gn-doc .pill.gr{background:#e3ead5;color:#4f6b34}
.gn-doc .dcards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;flex:1;align-content:start}
.gn-doc .dcard{background:var(--card);border:1px solid var(--bd);border-radius:13px;padding:14px 16px;display:flex;flex-direction:column}
.gn-doc .dc-k{font:500 8px 'Jost';letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin-bottom:9px}
.gn-doc .dc-v{font:600 17px 'Jost';color:var(--num);line-height:1.05;font-variant-numeric:tabular-nums;display:flex;align-items:baseline;gap:6px}
.gn-doc .dc-up{font:600 9px 'IBM Plex Sans';color:#5a7c3b}
.gn-doc .dc-s{font:400 9px 'IBM Plex Sans';color:var(--muted);margin-top:7px}
.gn-doc .dtl{display:grid;grid-template-columns:1fr 1fr;gap:0 11mm;flex:1}
.gn-doc .dtl-row{display:flex;justify-content:space-between;align-items:flex-end;padding:9px 0;border-bottom:1px solid var(--bd2)}
.gn-doc .dtl-l{font:400 11px 'IBM Plex Sans';color:#334023}
.gn-doc .dtl-l small{display:block;font-size:8.5px;color:var(--muted);margin-top:3px}
.gn-doc .dtl-v{font:600 14px 'Jost';color:var(--num);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.gn-doc .dtl-v .upx{display:block;font:600 8.5px 'IBM Plex Sans';color:#5a7c3b;margin-top:2px}
.gn-doc .exsum{flex:1;display:flex;flex-direction:column;gap:13px;background:var(--card);border:1px solid var(--bd);border-radius:13px;padding:22px 26px}
.gn-doc .exsum p{font:400 11.5px/1.75 'IBM Plex Sans';color:#3c4630;text-align:justify}
.gn-doc .exsum p b{font-weight:600;color:var(--num)}
.gn-doc .exsum .exsum-sign{margin-top:auto;font:500 10px 'Jost';letter-spacing:.04em;color:var(--gold);text-align:right;border-top:1px solid var(--bd2);padding-top:13px}
.gn-doc .pend-hero{flex:none;background:#fbeae7;border:1.5px solid #e0b1a8;border-radius:14px;padding:16px 22px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.gn-doc .pend-hero-k{font:600 9px 'Jost';letter-spacing:.16em;text-transform:uppercase;color:#a23a2e}
.gn-doc .pend-hero-sub{font:400 10px 'IBM Plex Sans';color:#9a685c;margin-top:5px}
.gn-doc .pend-hero-v{font:300 17px 'Jost';color:#9a2a1e;white-space:nowrap;font-variant-numeric:tabular-nums}
.gn-doc .pend-hero-v .rs{font-size:.58em;font-weight:500;color:#b56a5a;margin-right:2px}
.gn-doc .ptbl{display:flex;flex-direction:column;border:1px solid var(--bd);border-radius:12px;overflow:hidden;background:var(--card)}
.gn-doc .ptbl-h{display:grid;grid-template-columns:1fr 78px 108px 92px;gap:10px;padding:9px 15px;background:#f7f2e6;font:600 8px 'Jost';letter-spacing:.1em;text-transform:uppercase;color:var(--gold)}
.gn-doc .ptbl-r{display:grid;grid-template-columns:1fr 78px 108px 92px;gap:10px;padding:9px 15px;border-top:1px solid var(--bd2);font:400 10.5px 'IBM Plex Sans';color:#3c4630;align-items:center}
.gn-doc .ptbl .r{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
.gn-doc .ptbl-d{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gn-doc .ptbl-s{color:#a23a2e;text-transform:capitalize;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gn-doc .ptbl-g{display:inline-block;margin-left:8px;padding:1px 7px;border-radius:20px;background:#e3ead5;color:#4f6b34;font:600 7px 'Jost';letter-spacing:.08em;text-transform:uppercase;vertical-align:middle}
.gn-doc .foot{margin-top:auto;display:flex;justify-content:space-between;align-items:center;padding-top:5mm;border-top:1px solid var(--bd)}
.gn-doc .foot-l{display:flex;align-items:center;gap:9px}
.gn-doc .fnm{font:600 9.5px 'IBM Plex Sans';color:#334023}
.gn-doc .fct{font:400 8.5px 'IBM Plex Sans';color:var(--muted);margin-top:1px}
.gn-doc .foot-r{font:400 8px 'IBM Plex Sans';color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
/* Fidelidade na exportação/impressão: o html2canvas não renderiza texto em
   gradiente (background-clip:text) — cai para dourado sólido durante a captura
   (.exporting) e na impressão. O gradiente permanece só na visualização em tela. */
.gn-doc.exporting .wm-1,.gn-doc.exporting .gp-big .n{background:none!important;-webkit-text-fill-color:initial!important}
.gn-doc.exporting .wm-1{color:#d8b75a!important}
.gn-doc.exporting .gp-big .n{color:#9c7a22!important}
.gn-doc.exporting .page{box-shadow:none!important}
@media print{
  @page{size:A4;margin:0}
  .gn-doc .wm-1,.gn-doc .gp-big .n{background:none!important;-webkit-text-fill-color:initial!important}
  .gn-doc .wm-1{color:#d8b75a!important}
  .gn-doc .gp-big .n{color:#9c7a22!important}
  body *{visibility:hidden!important}
  #rep-overlay,#rep-overlay *{visibility:visible!important}
  #rep-overlay{position:absolute;left:0;top:0;width:100%;background:#fff!important;padding:0!important}
  .gn-doc{background:#fff!important;padding:0!important}
  .gn-doc .page{box-shadow:none!important;margin:0!important;break-after:page;content-visibility:visible!important}
}
`
