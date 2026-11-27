-- 047: jornadas ignoradas en el juego.
--
-- Desde Admin → Jornadas ignoradas se marcan jornadas cuyos puntos no cuentan
-- para el juego (ni clasificación, ni pagos, ni podios/colistas, ni sanciones).
-- Cada una lleva el texto del aviso que ven los usuarios arriba de la pantalla
-- y en la campana, desde 7 días antes del primer partido de la jornada hasta
-- que terminan todos sus partidos.
--
-- Se guarda en league_config (una lista JSON) para que ya la cubran el trigger
-- de data_versions (042/043) y las lecturas existentes de league_config:
--   [{ "matchday": 15, "message": "Parón por ..." }, ...]
--
-- Se aplica a mano en el SQL Editor. Es reejecutable.

alter table public.league_config
    add column if not exists ignored_matchdays jsonb not null default '[]'::jsonb;

-- Comprobación:
--   select ignored_matchdays from public.league_config where id = 1;
