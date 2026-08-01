'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLeagueConfig } from '@/lib/league-config'
import { RefreshCw, Save, Trophy } from 'lucide-react'

// Un componente de campo numérico rápido para este panel
function NumberField({ label, value, onChange, step = "1", min = "0" }: { label: string, value: number, onChange: (v: number) => void, step?: string, min?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step}
        min={min}
        className="w-full px-3 py-2 rounded-lg border-2 border-slate-200 outline-none focus:border-amber-500 text-sm"
      />
    </div>
  )
}

export function PrizesPanel() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [totalPot, setTotalPot] = useState(0)
  const [configValues, setConfigValues] = useState<Record<string, number>>({})
  const [err, setErr] = useState('')

  // Usamos el hook, pero queremos tener estado local para poder guardar cambios sin recargar
  const baseConfig = useLeagueConfig()

  useEffect(() => {
    if (Object.keys(configValues).length === 0 && baseConfig.entry_fee !== undefined) {
      setConfigValues({
        entry_fee: baseConfig.entry_fee,
        prize_div1_1st: baseConfig.prize_div1_1st,
        prize_div1_2nd: baseConfig.prize_div1_2nd,
        prize_div1_3rd: baseConfig.prize_div1_3rd,
        prize_div2_1st: baseConfig.prize_div2_1st,
        prize_div2_2nd: baseConfig.prize_div2_2nd,
        prize_div2_3rd: baseConfig.prize_div2_3rd,
        prize_div3_1st: baseConfig.prize_div3_1st,
        prize_div3_2nd: baseConfig.prize_div3_2nd,
        prize_div3_3rd: baseConfig.prize_div3_3rd,
      })
    }
  }, [baseConfig, configValues])

  useEffect(() => {
    const fetchPot = async () => {
      const supabase = createClient()
      const { data: users, error } = await supabase.from('profiles').select('id, amount_paid')
      if (error) {
        console.error("Error fetching users for pot", error)
        return
      }

      if (users) {
        const totalUsers = users.length
        const totalAmountPaid = users.reduce((acc, u) => acc + (u.amount_paid || 0), 0)
        const fee = configValues.entry_fee ?? baseConfig.entry_fee ?? 50
        setTotalPot((totalUsers * fee) + totalAmountPaid)
      }
      setLoading(false)
    }

    if (configValues.entry_fee !== undefined) {
      fetchPot()
    }
  }, [configValues.entry_fee, baseConfig.entry_fee])

  const saveConfig = async () => {
    setSaving(true)
    setErr('')
    try {
      const supabase = createClient()
      const res = await supabase.from('league_config').update(configValues).eq('id', 1)
      if (res.error) throw res.error
    } catch (e: any) {
      setErr(e.message || 'Error guardando config de premios')
    } finally {
      setSaving(false)
    }
  }

  const setNum = (key: string, val: number) => {
    setConfigValues(prev => ({ ...prev, [key]: val }))
  }

  const calcPrize = (percent: number) => {
    return (totalPot * (percent / 100)).toFixed(2)
  }

  if (loading || Object.keys(configValues).length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex justify-center">
        <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="bg-slate-50 border-b border-slate-200 p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Reparto de Premios</h2>
            <p className="text-sm text-slate-500">Recaudación y configuración de premios por división</p>
          </div>
        </div>
        <button
          onClick={saveConfig}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar config
        </button>
      </div>

      <div className="p-6">
        {err && <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg text-sm font-medium">{err}</div>}

        <div className="bg-amber-50 rounded-xl p-6 border-2 border-amber-100 text-center mb-8">
          <h3 className="text-slate-600 font-semibold mb-2 uppercase tracking-wide text-sm">Recaudación Total</h3>
          <div className="text-4xl font-black text-amber-600 tracking-tight">
            {totalPot.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </div>
          <p className="text-xs text-amber-700/70 mt-2 font-medium">Bote base (Usuarios × Cuota) + Penalizaciones de jornadas</p>
        </div>

        <div className="mb-8 max-w-sm">
          <NumberField label="Cuota de Inscripción por Usuario (€)" value={configValues.entry_fee} onChange={(v) => setNum('entry_fee', v)} step="1" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* DIV 1 */}
          <div className="space-y-4">
            <h4 className="font-bold text-slate-800 border-b pb-2">1ª División</h4>
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b">
                  <th className="pb-2">Posición</th>
                  <th className="pb-2 text-right">Premio</th>
                  <th className="pb-2 text-right w-20">%</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-3 font-semibold text-slate-700">1º Clasificado</td>
                  <td className="py-3 text-right font-bold text-emerald-600">{calcPrize(configValues.prize_div1_1st)}€</td>
                  <td className="py-2 pl-4"><input type="number" className="w-full text-right bg-slate-50 border rounded px-2 py-1 text-xs outline-none focus:border-amber-500" value={configValues.prize_div1_1st} onChange={e => setNum('prize_div1_1st', Number(e.target.value))} /></td>
                </tr>
                <tr>
                  <td className="py-3 font-semibold text-slate-700">2º Clasificado</td>
                  <td className="py-3 text-right font-bold text-emerald-600">{calcPrize(configValues.prize_div1_2nd)}€</td>
                  <td className="py-2 pl-4"><input type="number" className="w-full text-right bg-slate-50 border rounded px-2 py-1 text-xs outline-none focus:border-amber-500" value={configValues.prize_div1_2nd} onChange={e => setNum('prize_div1_2nd', Number(e.target.value))} /></td>
                </tr>
                <tr>
                  <td className="py-3 font-semibold text-slate-700">3º Clasificado</td>
                  <td className="py-3 text-right font-bold text-emerald-600">{calcPrize(configValues.prize_div1_3rd)}€</td>
                  <td className="py-2 pl-4"><input type="number" className="w-full text-right bg-slate-50 border rounded px-2 py-1 text-xs outline-none focus:border-amber-500" value={configValues.prize_div1_3rd} onChange={e => setNum('prize_div1_3rd', Number(e.target.value))} /></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* DIV 2 */}
          <div className="space-y-4">
            <h4 className="font-bold text-slate-800 border-b pb-2">2ª División</h4>
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b">
                  <th className="pb-2">Posición</th>
                  <th className="pb-2 text-right">Premio</th>
                  <th className="pb-2 text-right w-20">%</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-3 font-semibold text-slate-700">1º Clasificado</td>
                  <td className="py-3 text-right font-bold text-emerald-600">{calcPrize(configValues.prize_div2_1st)}€</td>
                  <td className="py-2 pl-4"><input type="number" className="w-full text-right bg-slate-50 border rounded px-2 py-1 text-xs outline-none focus:border-amber-500" value={configValues.prize_div2_1st} onChange={e => setNum('prize_div2_1st', Number(e.target.value))} /></td>
                </tr>
                <tr>
                  <td className="py-3 font-semibold text-slate-700">2º Clasificado</td>
                  <td className="py-3 text-right font-bold text-emerald-600">{calcPrize(configValues.prize_div2_2nd)}€</td>
                  <td className="py-2 pl-4"><input type="number" className="w-full text-right bg-slate-50 border rounded px-2 py-1 text-xs outline-none focus:border-amber-500" value={configValues.prize_div2_2nd} onChange={e => setNum('prize_div2_2nd', Number(e.target.value))} /></td>
                </tr>
                <tr>
                  <td className="py-3 font-semibold text-slate-700">3º Clasificado</td>
                  <td className="py-3 text-right font-bold text-emerald-600">{calcPrize(configValues.prize_div2_3rd)}€</td>
                  <td className="py-2 pl-4"><input type="number" className="w-full text-right bg-slate-50 border rounded px-2 py-1 text-xs outline-none focus:border-amber-500" value={configValues.prize_div2_3rd} onChange={e => setNum('prize_div2_3rd', Number(e.target.value))} /></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* DIV 3 */}
          <div className="space-y-4">
            <h4 className="font-bold text-slate-800 border-b pb-2">3ª División</h4>
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b">
                  <th className="pb-2">Posición</th>
                  <th className="pb-2 text-right">Premio</th>
                  <th className="pb-2 text-right w-20">%</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-3 font-semibold text-slate-700">1º Clasificado</td>
                  <td className="py-3 text-right font-bold text-emerald-600">{calcPrize(configValues.prize_div3_1st)}€</td>
                  <td className="py-2 pl-4"><input type="number" className="w-full text-right bg-slate-50 border rounded px-2 py-1 text-xs outline-none focus:border-amber-500" value={configValues.prize_div3_1st} onChange={e => setNum('prize_div3_1st', Number(e.target.value))} /></td>
                </tr>
                <tr>
                  <td className="py-3 font-semibold text-slate-700">2º Clasificado</td>
                  <td className="py-3 text-right font-bold text-emerald-600">{calcPrize(configValues.prize_div3_2nd)}€</td>
                  <td className="py-2 pl-4"><input type="number" className="w-full text-right bg-slate-50 border rounded px-2 py-1 text-xs outline-none focus:border-amber-500" value={configValues.prize_div3_2nd} onChange={e => setNum('prize_div3_2nd', Number(e.target.value))} /></td>
                </tr>
                <tr>
                  <td className="py-3 font-semibold text-slate-700">3º Clasificado</td>
                  <td className="py-3 text-right font-bold text-emerald-600">{calcPrize(configValues.prize_div3_3rd)}€</td>
                  <td className="py-2 pl-4"><input type="number" className="w-full text-right bg-slate-50 border rounded px-2 py-1 text-xs outline-none focus:border-amber-500" value={configValues.prize_div3_3rd} onChange={e => setNum('prize_div3_3rd', Number(e.target.value))} /></td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  )
}
