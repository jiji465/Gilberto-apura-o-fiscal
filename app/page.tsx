import Link from "next/link"
import { FileBarChart2, Settings, ArrowRight, Upload, Calculator } from "lucide-react"

export default function Home() {
  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <h1 className="font-serif text-2xl text-[var(--navy)]">Painel</h1>
      <p className="text-sm text-[var(--muted)] mt-1">Gere o relatório fiscal mensal do cliente. Os dados são preenchidos a cada competência — nada fica salvo.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        <Link href="/relatorio" className="card p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Relatório Mensal</span>
            <FileBarChart2 className="h-5 w-5 text-[var(--gold)]" />
          </div>
          <div className="font-serif text-xl text-[var(--navy)] mt-3">Gerar relatório</div>
          <div className="text-sm text-[var(--muted)] mt-1">Importe o PGDAS-D (Simples) ou informe os dados (Lucro Presumido/Real, MEI) e gere o PDF.</div>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--navy)] mt-4">Abrir <ArrowRight className="h-4 w-4" /></span>
        </Link>
        <Link href="/configuracoes" className="card p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Configurações</span>
            <Settings className="h-5 w-5 text-[var(--gold)]" />
          </div>
          <div className="font-serif text-xl text-[var(--navy)] mt-3">Parâmetros de alíquotas</div>
          <div className="text-sm text-[var(--muted)] mt-1">PIS/COFINS/ISS, presunções de IRPJ/CSLL e a majoração da LC 224/2025 usadas na comparação e no Lucro Presumido.</div>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--navy)] mt-4">Abrir <ArrowRight className="h-4 w-4" /></span>
        </Link>
      </div>

      <div className="card p-6 mt-4">
        <h2 className="font-semibold text-[var(--ink)] mb-3">Como funciona</h2>
        <ol className="text-sm text-[var(--muted)] space-y-2 list-decimal pl-5">
          <li className="flex items-start gap-2"><Upload className="h-4 w-4 mt-0.5 text-[var(--gold)] shrink-0" /><span>No Simples Nacional, anexe o PGDAS-D — o sistema preenche faturamento, RBT12, anexo, Fator R e a repartição do DAS.</span></li>
          <li className="flex items-start gap-2"><Calculator className="h-4 w-4 mt-0.5 text-[var(--gold)] shrink-0" /><span>Nos demais regimes, informe os dados do mês (nome, CNPJ, faturamento, folha, etc.).</span></li>
          <li className="flex items-start gap-2"><FileBarChart2 className="h-4 w-4 mt-0.5 text-[var(--gold)] shrink-0" /><span>Visualize e baixe/imprima o relatório. Cada competência é independente.</span></li>
        </ol>
      </div>
    </div>
  )
}
