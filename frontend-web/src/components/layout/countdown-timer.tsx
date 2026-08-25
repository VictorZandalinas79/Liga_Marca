'use client'

import { useMatchdayLock } from '@/hooks/use-matchday-lock'
import { Clock } from 'lucide-react'

export function CountdownTimer() {
  const { isUnlockWindowOpen, timeUntilLock, timeUntilUnlock, isCloseToStart } = useMatchdayLock()

  if (isUnlockWindowOpen && timeUntilLock && timeUntilLock !== 'Finalizada') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-400/20 border border-amber-400/50">
        <Clock className="h-4 w-4 text-amber-500 animate-pulse" />
        <span className="text-xs font-bold text-amber-600">
          Finaliza en: <span className="text-sm font-mono">{timeUntilLock}</span>
        </span>
      </div>
    )
  }

  if (!isUnlockWindowOpen && timeUntilUnlock) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
        isCloseToStart
          ? 'bg-red-500/10 border-red-500/30 text-red-600 animate-pulse text-sm font-bold'
          : 'bg-slate-700/50 border-slate-600/50 text-slate-400 text-xs font-medium'
      }`}>
        <Clock className={`h-4 w-4 ${isCloseToStart ? 'text-red-500 animate-bounce' : 'text-slate-400'}`} />
        <span>
          {isCloseToStart ? 'Cierre de cambios en: ' : 'Abre en: '}
          <span className={`font-mono ${isCloseToStart ? 'text-sm font-black text-red-600' : 'text-sm'}`}>{timeUntilUnlock}</span>
        </span>
      </div>
    )
  }

  return null
}
