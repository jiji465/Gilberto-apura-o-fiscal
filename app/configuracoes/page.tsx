"use client"

import { useEffect, useState } from "react"
import { Settings, Save, RotateCcw } from "lucide-react"
import { PARAMETROS_PADRAO, type ParametrosFiscais } from "@/lib/config"
import { getParametros, saveParametros } from "@/lib/storage"
import { toastSuccess, toastInfo } from "@/lib/toast"

export default function ConfiguracoesPage() {
  const [p, setP] = useState<ParametrosFiscais>(PARAMETROS_PADRAO)

  useEffect(() => { setP(getParametros()) }, [])

  const set = (k: keyof ParametrosFiscais, v: number | boolean) => setP((prev) => ({ ...prev, [k]: v }))
  const num = (v: string) => (v === "" ? 0 : parseFloat(v.replace(",", ".")) || 0)

  function salvar() {
    saveParametros(p)
    toastSuccess("Parâmetros salvos. Aplicados nos próximos cálculos.")
  }
  function restaurar() {
    setP(PARAMETROS_PADRAO)
    saveParametros(PARAMETROS_PADRAO)
    toastInfo("Parâmetros restaurados ao padrão (2026).")
  }

  const Field = ({ k, label, sufixo = "%", step = "0.01" }: { k: keyof ParametrosFiscais; label: string; sufixo?: string; step?: string }) => (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input className="input pr-10" type="number" step={step} value={String(p[k] as number)} onChange={(e) => set(k, num(e.target.value))} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">{sufixo}</span>
      </div>
    </div>
  )

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[var(--navy)] flex items-center gap-2"><Settings className="h-6 w-6" /> Configurações</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Alíquotas usadas na apuração do Lucro Presumido/Real e na comparação com o Simples Nacional.</p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="card p-5">
          <h2 className="font-semibold mb-1">PIS / COFINS / ISS</h2>
          <p className="text-xs text-[var(--muted)] mb-4">PIS/COFINS no regime cumulativo (sem créditos). ISS é o padrão para serviços — varia por município e pode ser ajustado em cada competência.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field k="pisCumulativo" label="PIS" />
            <Field k="cofinsCumulativo" label="COFINS" />
            <Field k="issPadrao" label="ISS padrão (serviços)" />
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-1">Presunções (base de cálculo)</h2>
          <p className="text-xs text-[var(--muted)] mb-4">Percentual da receita que vira base de IRPJ e CSLL, por tipo de atividade.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field k="presIrpjServicos" label="IRPJ · Serviços" />
            <Field k="presIrpjComercio" label="IRPJ · Comércio/Indústria" />
            <Field k="presCsllServicos" label="CSLL · Serviços" />
            <Field k="presCsllComercio" label="CSLL · Comércio/Indústria" />
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-1">IRPJ / CSLL</h2>
          <p className="text-xs text-[var(--muted)] mb-4">Alíquotas e adicional do IRPJ.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field k="irpjRate" label="IRPJ" />
            <Field k="csllRate" label="CSLL" />
            <Field k="irpjAdicRate" label="Adicional IRPJ" />
            <Field k="irpjAdicLimiteMensal" label="Limite do adicional" sufixo="R$/mês" step="100" />
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-1">Majoração da presunção — LC 224/2025</h2>
          <p className="text-xs text-[var(--muted)] mb-4">Acréscimo na presunção de IRPJ/CSLL sobre a parcela de receita que ultrapassa o limite anual.</p>
          <label className="flex items-center gap-2 mb-4 text-sm cursor-pointer">
            <input type="checkbox" checked={p.majoracaoAtiva} onChange={(e) => set("majoracaoAtiva", e.target.checked)} />
            Aplicar a majoração
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field k="majoracaoPct" label="Majoração" />
            <Field k="majoracaoLimiteAnual" label="Limite anual" sufixo="R$/ano" step="100000" />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn btn-outline" onClick={restaurar}><RotateCcw className="h-4 w-4" /> Restaurar padrão</button>
          <button className="btn btn-primary" onClick={salvar}><Save className="h-4 w-4" /> Salvar parâmetros</button>
        </div>
      </div>
    </div>
  )
}
