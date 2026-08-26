-- Dos variantes para "horas antes del primer partido" según el día en que
-- arranca la jornada: los partidos entre semana (martes/miércoles/jueves)
-- suelen necesitar menos antelación que el resto de días (viernes a lunes).
-- matchday_start_hours_before se mantiene como valor heredado (usado por
-- cálculos que no necesitan distinguir por día) y queda sincronizado con la
-- variante de fin de semana desde el panel de admin.

ALTER TABLE league_config
    ADD COLUMN IF NOT EXISTS matchday_start_hours_before_midweek NUMERIC NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS matchday_start_hours_before_weekend NUMERIC NOT NULL DEFAULT 1;

UPDATE league_config
SET matchday_start_hours_before_midweek = matchday_start_hours_before,
    matchday_start_hours_before_weekend = matchday_start_hours_before
WHERE id = 1;
