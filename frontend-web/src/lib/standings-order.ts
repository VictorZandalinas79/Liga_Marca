type Rankable = { total_points: number; podium_finishes: number }

/**
 * Orden oficial de la clasificación: más puntos y, en caso de empate, más
 * podios. Compara a un decimal (lo que se ve en pantalla) para que el ruido de
 * coma flotante de las sumas no impida detectar un empate.
 */
export function compareStandings(a: Rankable, b: Rankable): number {
  const byPoints = Math.round(b.total_points * 10) - Math.round(a.total_points * 10)
  return byPoints !== 0 ? byPoints : (b.podium_finishes || 0) - (a.podium_finishes || 0)
}
