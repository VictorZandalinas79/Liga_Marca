'use client'

import { useMatchdayLock } from '@/hooks/use-matchday-lock'
import { Clock } from 'lucide-react'

export function CountdownTimer() {
  const { isUnlockWindowOpen, timeUntilLock, timeUntilUnlock } = useMatchdayLock()

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
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50">
        <Clock className="h-4 w-4 text-slate-400" />
        <span className="text-xs font-medium text-slate-400">
          Abre en: <span className="text-sm font-mono">{timeUntilUnlock}</span>
        </span>
      </div>
    )
  }

  return null
}
