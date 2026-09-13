import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LeagueConfig, DEFAULT_LEAGUE_CONFIG, ParsedFormation, parseFormation } from './league-config-types'

export * from './league-config-types'

let cachedConfig: LeagueConfig | null = null
let fetchPromise: Promise<LeagueConfig | null> | null = null

async function getCachedOrFetchConfig(): Promise<LeagueConfig> {
  if (cachedConfig) return cachedConfig
  if (fetchPromise) return (await fetchPromise) || DEFAULT_LEAGUE_CONFIG

  fetchPromise = (async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('league_config')
        .select('*')
        .eq('id', 1)
        .maybeSingle()

      if (!error && data) {
        cachedConfig = { ...DEFAULT_LEAGUE_CONFIG, ...data, _isLoaded: true }
        return cachedConfig
      }
    } catch (e) {
      console.error('Error fetching league config:', e)
    } finally {
      fetchPromise = null
    }
    return DEFAULT_LEAGUE_CONFIG
  })()

  return (await fetchPromise) || DEFAULT_LEAGUE_CONFIG
}

export function invalidateLeagueConfigCache() {
  cachedConfig = null
}

export function useLeagueConfig(): LeagueConfig {
  const [config, setConfig] = useState<LeagueConfig>(cachedConfig || DEFAULT_LEAGUE_CONFIG)

  useEffect(() => {
    let mounted = true

    if (cachedConfig) {
      setConfig(cachedConfig)
      return
    }

    getCachedOrFetchConfig().then((cfg) => {
      if (mounted && cfg) {
        setConfig(cfg)
      }
    })

    return () => {
      mounted = false
    }
  }, [])

  return config
}
