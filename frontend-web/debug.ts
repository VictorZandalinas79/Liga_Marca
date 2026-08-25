import { evaluateRelevoBlocks, RELEVO_BLOCKS, type RelevoLimits } from './src/lib/scoring-config'

const score = {
  minutes_played: 64,
  passes_completed: 1, // just example
  passes_attempted: 2,
  // final_third_events is missing, so it's undefined
  pass_opp_pct: 67, // wait, passOppPct uses 'passes_completed_opp_half' and 'passes_attempted_opp_half' ?
  passes_completed_opp_half: 2,
  passes_attempted_opp_half: 3,
}

// wait, passOppPct uses what fields? Let's check scoring-config.ts
