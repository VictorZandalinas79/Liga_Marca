import type { ReactNode } from 'react'

export interface RankingTheme {
  head: string
  text: string
  muted: string
  bar: string
  value: string
}

// Clases literales para que Tailwind las detecte. Los fondos claros llevan
// texto oscuro y los fondos oscuros texto blanco para mantener el contraste.
export const RANKING_THEMES = {
  record: { head: 'bg-amber-400', text: 'text-amber-950', muted: 'text-amber-900', bar: 'bg-amber-200/70', value: 'text-amber-800' },
  bus: { head: 'bg-sky-700', text: 'text-white', muted: 'text-sky-100', bar: 'bg-sky-200/70', value: 'text-sky-800' },
  offensive: { head: 'bg-orange-500', text: 'text-orange-950', muted: 'text-orange-950', bar: 'bg-orange-200/70', value: 'text-orange-800' },
  average: { head: 'bg-emerald-700', text: 'text-white', muted: 'text-emerald-100', bar: 'bg-emerald-200/70', value: 'text-emerald-800' },
  impact: { head: 'bg-blue-700', text: 'text-white', muted: 'text-blue-100', bar: 'bg-blue-200/70', value: 'text-blue-800' },
  changes: { head: 'bg-purple-700', text: 'text-white', muted: 'text-purple-100', bar: 'bg-purple-200/70', value: 'text-purple-800' },
  kamikaze: { head: 'bg-rose-700', text: 'text-white', muted: 'text-rose-100', bar: 'bg-rose-200/70', value: 'text-rose-800' },
  opens: { head: 'bg-indigo-900', text: 'text-white', muted: 'text-indigo-200', bar: 'bg-indigo-200/70', value: 'text-indigo-900' },
  bacona: { head: 'bg-pink-300', text: 'text-pink-950', muted: 'text-pink-900', bar: 'bg-pink-200/70', value: 'text-pink-800' },
} satisfies Record<string, RankingTheme>

interface RankingEntry {
  user_id: string
  user_name: string
}

interface RankingCardProps<T extends RankingEntry> {
  title: string
  icon: ReactNode
  theme: RankingTheme
  entries: T[]
  currentUserId?: string | null
  metric: (entry: T) => number
  formatValue: (entry: T) => string
  /** Unidad de las marcas, junto al título. Por ejemplo "pts" o "defensas". */
  leaderUnit?: (entry: T) => string
  /** Para rankings en los que gana la cifra más baja, como el Kamikaze. */
  lowerIsBetter?: boolean
  onOpen: () => void
}

function YouTag() {
  return (
    <span className="shrink-0 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold normal-case leading-none text-white">
      Tú
    </span>
  )
}

export function RankingCard<T extends RankingEntry>({
  title,
  icon,
  theme,
  entries,
  currentUserId,
  metric,
  formatValue,
  leaderUnit,
  lowerIsBetter = false,
  onOpen,
}: RankingCardProps<T>) {
  const [leader, ...chasers] = entries
  if (!leader) return null

  // La barra mide cada marca respecto a la del líder.
  const leaderMetric = metric(leader)
  const barWidth = (entry: T) => {
    const value = metric(entry)
    if (value <= 0 || leaderMetric <= 0) return 0
    const ratio = lowerIsBetter ? leaderMetric / value : value / leaderMetric
    return Math.min(ratio, 1) * 100
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${title}: ver el ranking completo`}
      className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-md ring-1 ring-slate-900/10 transition-shadow hover:shadow-xl focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
    >
      <div className={`${theme.head} ${theme.text} px-3 py-2`}>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white p-0.5 shadow-sm">
            {icon}
          </span>
          <h3 className="min-w-0 flex-1 truncate text-xs font-bold">{title}</h3>
          {leaderUnit && <span className={`shrink-0 text-xs font-semibold ${theme.muted}`}>{leaderUnit(leader)}</span>}
        </div>
        <p className="mt-1 flex items-center gap-2 px-1">
          <span aria-hidden="true" className="w-4 shrink-0 text-center text-lg font-black tabular-nums opacity-60">1</span>
          <span className="min-w-0 flex-1 truncate text-base font-black uppercase tracking-tight">{leader.user_name}</span>
          {leader.user_id === currentUserId && <YouTag />}
          <span className="shrink-0 text-lg font-black tabular-nums">{formatValue(leader)}</span>
        </p>
      </div>

      {chasers.length > 0 && (
        <ol start={2} className="flex-1 space-y-0.5 p-1.5">
          {chasers.map((entry, index) => (
            <li key={entry.user_id} className="relative overflow-hidden rounded-lg">
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 left-0 rounded-lg ${theme.bar}`}
                style={{ width: `${barWidth(entry)}%` }}
              />
              <span className="relative flex items-center gap-2 px-1.5 py-1">
                <span className="w-4 shrink-0 text-center text-sm font-black tabular-nums text-slate-500">{index + 2}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold uppercase tracking-tight text-slate-800">
                  {entry.user_name}
                </span>
                {entry.user_id === currentUserId && <YouTag />}
                <span className={`shrink-0 text-sm font-black tabular-nums ${theme.value}`}>{formatValue(entry)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </button>
  )
}
