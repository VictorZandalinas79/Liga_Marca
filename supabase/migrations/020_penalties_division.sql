-- Divisiones como partición de primera clase de las sanciones.
--
-- Cada división es una liga independiente: su clasificación, sus sanciones y su
-- reparto de pagos. Hasta ahora `penalties` no guardaba a qué división
-- pertenecía cada multa, así que toda vista que quisiera enseñar "las sanciones
-- de mi división" tenía que cruzar contra `profiles` por su cuenta. Cada uno de
-- esos cruces repetidos era una ocasión de saltarse el aislamiento.
--
-- Se persiste la división en el momento de calcular la multa. Como las
-- divisiones se congelan al cerrar el mercado de la primera jornada del juego,
-- ese valor no puede quedar desfasado.

ALTER TABLE penalties
  ADD COLUMN IF NOT EXISTS division SMALLINT;

-- Backfill: la división actual del usuario es la que tenía cuando se calculó,
-- porque no cambian una vez empezada la liga.
UPDATE penalties p
SET division = pr.division
FROM profiles pr
WHERE p.user_id = pr.id
  AND p.division IS DISTINCT FROM pr.division;

CREATE INDEX IF NOT EXISTS idx_penalties_division_matchday
  ON penalties(division, matchday);
