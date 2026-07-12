"use client"

// Utilitários de PDF (somente client-side; libs carregadas sob demanda).
//   • lerTextoPGDAS: extrai o texto de um PDF do PGDAS-D (pdfjs-dist).
//   • exportRelatorioPDF: captura as folhas `.sheet` do relatório na tela e
//     monta um PDF A4 (jspdf + html2canvas-pro).
// Nota: este PDF é RASTER (imagem por página) — fiel ao design, porém sem texto
// selecionável. Para PDF vetorial/selecionável, use "Imprimir / PDF" (window.print
// + @media print @page). Aqui priorizamos nitidez: escala 2 + PNG (sem artefato JPEG).

export function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Relatorio Fiscal"
}

/** Extrai o texto selecionável de um PDF (Declaração/Extrato do PGDAS-D). */
export async function lerTextoPGDAS(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  const buf = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buf }).promise
  let txt = ""
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const tc = await page.getTextContent()
    tc.items.forEach((it: any) => {
      txt += it.str + (it.hasEOL ? "\n" : " ")
    })
    txt += "\n"
  }
  return txt
}

async function buildRelatorioPDF() {
  const [{ jsPDF }, html2canvasMod] = await Promise.all([import("jspdf"), import("html2canvas-pro")])
  const html2canvas = (html2canvasMod as any).default || html2canvasMod

  const root = document.getElementById("rep-overlay")
  if (!root) throw new Error("Relatório não encontrado na tela.")
  const sheets = Array.from(root.querySelectorAll<HTMLElement>(".sheet"))
  if (!sheets.length) throw new Error("Nenhuma página para exportar.")

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()

  // Garante que as fontes (auto-hospedadas) já carregaram antes de capturar,
  // senão o html2canvas rasteriza com a fonte de fallback.
  try { await (document as any).fonts?.ready } catch { /* browsers sem Font Loading API */ }
  // .exporting → texto em gradiente vira cor sólida e remove sombras (fidelidade)
  root.classList.add("exporting")
  try {
    for (let i = 0; i < sheets.length; i++) {
      let canvas: HTMLCanvasElement
      try {
        canvas = await html2canvas(sheets[i], { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false })
      } catch (e) {
        throw new Error(`Falha ao renderizar a página ${i + 1} de ${sheets.length}.`)
      }
      // PNG (lossless) → texto/linhas nítidos, sem artefato de JPEG. compress:true
      // no jsPDF aplica deflate na imagem, então o arquivo continua enxuto.
      const img = canvas.toDataURL("image/png")
      const imgH = (canvas.height * pageW) / canvas.width
      if (i > 0) pdf.addPage()
      pdf.addImage(img, "PNG", 0, 0, pageW, Math.min(imgH, pageH), undefined, "MEDIUM")
      // libera memória do canvas (importante com muitas páginas)
      canvas.width = 0
      canvas.height = 0
      // cede o thread entre páginas: não congela a UI e reduz o pico de memória
      await new Promise((r) => setTimeout(r, 0))
    }
  } finally {
    root.classList.remove("exporting")
  }
  return pdf
}

export async function exportRelatorioPDF(filename: string): Promise<void> {
  const pdf = await buildRelatorioPDF()
  pdf.save(filename.endsWith(".pdf") ? filename : filename + ".pdf")
}
