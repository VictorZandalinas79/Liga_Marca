# Live Match Modal & Modern Metrics Update

To ensure the "Partidos" page offers a live, modern breakdown of player stats including RELEVO points, the following changes will be made:

## 1. Live Updating in Modal
- Currently, when you click on a player, `selectedPlayer` holds a static snapshot. When `fetchPartido` polls every 30s in the background, the modal doesn't update.
- I will add a `useEffect` inside `partidos/[id]/page.tsx` to automatically sync `selectedPlayer` with the latest version from `homePlayers` / `awayPlayers` whenever they are refreshed. This ensures the modal updates live without needing to close and reopen it.

## 2. Dynamic Metrics in Metric Breakdown
- The `MetricBreakdown` component currently has hardcoded checks for specific bonuses (like `Despejes`, `Regates completados`) looking into `R.per_unit`.
- I will refactor `MetricBreakdown.tsx` so it correctly reads the unit values from `R.events` (the same way the PDF now does), ensuring it respects any modifications you made in the Admin panel (such as moving bonuses into the `events` section).
- I will also ensure it maps `fantasy_assist` correctly instead of `intent_assists`, mirroring the PDF fix we just did.

## 3. UI/UX Modernization
- I will polish the `MetricBreakdown` UI. We'll ensure the RELEVO block visually details the exact limits (like `(> 0.044/m)`) and uses progress bars or clear indicators for the metrics to make it feel premium and modern.
