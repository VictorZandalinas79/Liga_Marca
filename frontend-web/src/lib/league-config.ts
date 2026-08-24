import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LeagueConfig, DEFAULT_LEAGUE_CONFIG, ParsedFormation, parseFormation } from './league-config-types'

export * from './league-config-types'

export function useLeagueConfig(): LeagueConfig {
  const [config, setConfig] = useState<LeagueConfig>(DEFAULT_LEAGUE_CONFIG)

  useEffect(() => {
    let mounted = true

    const fetchConfig = async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('league_config')
        .select('*')
        .eq('id', 1)
        .maybeSingle()
      
      if (!error && data && mounted) {
        setConfig({ ...DEFAULT_LEAGUE_CONFIG, ...data, _isLoaded: true })
      }
    }

    fetchConfig()

    // Suscribirse a cambios en la tabla
    const supabase = createClient()
    const channel = supabase
      .channel(`league_config_changes_${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'league_config' },
        (payload) => {
          if (mounted && payload.new) {
            setConfig(c => ({ ...c, ...(payload.new as any), _isLoaded: true }))
          }
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [])

  return config
}
