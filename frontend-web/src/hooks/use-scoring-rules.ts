'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ScoringRules } from '@/lib/scoring-config'

/** Hook cliente: carga las reglas de scoring_config (null hasta que cargan). */
export function useScoringRules(): ScoringRules | null {
  const [rules, setRules] = useState<ScoringRules | null>(null)
  useEffect(() => {
    const run = async () => {
      const supabase = createClient()
      const { data } = await supabase.from('scoring_config').select('rules').eq('id', 1).maybeSingle()
      if (data?.rules) setRules(data.rules as ScoringRules)
    }
    run()
  }, [])
  return rules
}
