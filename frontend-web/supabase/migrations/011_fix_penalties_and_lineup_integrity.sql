-- 011_fix_penalties_and_lineup_integrity.sql
--
-- 1) `penalties` estaba sin columna `division`, pero el motor de sanciones
--    (3. calcular_sanciones_y_pagos.py) y el frontend (jornada/page.tsx,
--    api/notifications/route.ts) llevan tiempo escribiendo/leyendo ese campo.
--    Cada INSERT con sanciones reales lanzaba un error 42703 (columna
--    inexistente) sin capturar, así que NINGUNA sanción con multa > 0 se
--    llegaba a guardar en la tabla consolidada: por eso "faltan" sanciones
--    en la campanita y en el apartado Sanciones de Jornada.
ALTER TABLE penalties
ADD COLUMN IF NOT EXISTS division INTEGER;

CREATE INDEX IF NOT EXISTS idx_penalties_division ON penalties(division);

-- 2) OJO: NO se restringe que un equipo repita el mismo jugador dos veces en
--    su propia alineación (ej. fichar a "Pepe" dos veces). Eso es una
--    infracción de las reglas del juego, no un error técnico: se permite
--    guardar y se sanciona al cerrar la jornada (modelo "permitir +
--    sancionar" que ya usa el motor de sanciones). Por eso quitamos aquí
--    cualquier constraint de unicidad por jugador y solo dejamos la vieja
--    (team_id, player_id) sin jornada, que sí era un error de diseño de la
--    migración original 003 (impedía repetir jugador entre jornadas
--    distintas, rompiendo la retención sticky-draft) y no existe ya en
--    producción, pero la quitamos por si acaso quedó en algún entorno.
ALTER TABLE team_players DROP CONSTRAINT IF EXISTS team_players_team_id_player_id_key;

-- 3) Trigger que impide FÍSICAMENTE que un equipo tenga más de 11 titulares
--    en una misma jornada (sean repetidos o no), pase lo que pase en el
--    frontend. Esto es lo que evita el bug real: a un usuario le aparecieron
--    22 filas en una jornada por dos inserts concurrentes (doble click / dos
--    pestañas) sin protección alguna. El límite es sobre el CONTEO total,
--    no sobre qué jugadores hay, así que un "Pepe" repetido sigue permitido.
CREATE OR REPLACE FUNCTION enforce_max_11_starters()
RETURNS TRIGGER AS $$
DECLARE
    starter_count INT;
BEGIN
    IF NEW.is_starter THEN
        SELECT COUNT(*) INTO starter_count
        FROM team_players
        WHERE team_id = NEW.team_id
          AND matchday = NEW.matchday
          AND is_starter = TRUE
          AND id <> NEW.id;

        IF starter_count >= 11 THEN
            RAISE EXCEPTION 'Un equipo no puede tener más de 11 titulares en la misma jornada (team_id=%, matchday=%)', NEW.team_id, NEW.matchday;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_max_11_starters ON team_players;
CREATE TRIGGER trg_enforce_max_11_starters
    BEFORE INSERT OR UPDATE ON team_players
    FOR EACH ROW
    EXECUTE FUNCTION enforce_max_11_starters();

-- 4) La función RPC save_team_lineup ya hace DELETE+INSERT en una sola
--    transacción (atómica), pero no validaba el tamaño de la plantilla.
--    Añadimos la validación aquí, en el único punto de guardado seguro.
CREATE OR REPLACE FUNCTION save_team_lineup(
    p_team_id UUID,
    p_matchday INT,
    p_players JSONB
) RETURNS void AS $$
BEGIN
    IF jsonb_array_length(p_players) <> 11 THEN
        RAISE EXCEPTION 'La alineación debe tener exactamente 11 jugadores (recibidos: %)', jsonb_array_length(p_players);
    END IF;

    DELETE FROM team_players
    WHERE team_id = p_team_id AND matchday = p_matchday;

    INSERT INTO team_players (team_id, player_id, matchday, is_starter, is_captain, "order", replaced_player_id)
    SELECT
        p_team_id,
        (player->>'player_id')::TEXT,
        p_matchday,
        COALESCE((player->>'is_starter')::BOOLEAN, true),
        COALESCE((player->>'is_captain')::BOOLEAN, false),
        (player->>'order')::INT,
        (player->>'replaced_player_id')::TEXT
    FROM jsonb_array_elements(p_players) AS player;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
