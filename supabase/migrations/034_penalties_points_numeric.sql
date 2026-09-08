-- Las sanciones pueden calcularse a partir de puntuaciones de jugador con
-- decimales, así que `points` como INTEGER trunca/rechaza esos valores.
-- Se pasa a NUMERIC para admitir sanciones fraccionarias (p.ej. 38.5).

ALTER TABLE penalties
  ALTER COLUMN points TYPE NUMERIC USING points::numeric;
