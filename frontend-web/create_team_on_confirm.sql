-- ============================================
-- TRIGGER: Crear equipo automáticamente al confirmar email
-- ============================================

-- Función para crear equipo cuando el usuario confirma su email
CREATE OR REPLACE FUNCTION public.create_team_on_email_confirm()
RETURNS TRIGGER AS $$
DECLARE
    team_id_val UUID;
    target_matchday INTEGER := 0;
    players_data RECORD;
    selected_players TEXT[];
    player_ids TEXT[];
    idx INTEGER;
BEGIN
    -- Solo crear equipo si es un usuario nuevo (no actualización)
    IF TG_OP = 'INSERT' THEN
        -- Obtener la próxima jornada futura
        SELECT matchday INTO target_matchday
        FROM fixtures
        WHERE start_time >= NOW()
        ORDER BY start_time ASC
        LIMIT 1;

        -- Si no hay jornada futura, usar 0
        IF target_matchday IS NULL THEN
            target_matchday := 0;
        END IF;

        -- 1. Crear equipo en user_teams
        INSERT INTO user_teams (user_id, name)
        VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'Mi Equipo'))
        RETURNING id INTO team_id_val;

        RAISE NOTICE 'Equipo creado: % para usuario: %', team_id_val, NEW.id;

        -- 2. Obtener 11 jugadores aleatorios (1 GK, 4 DEF, 4 MID, 3 FWD)
        -- Goalkeeper
        SELECT array_agg(id) INTO player_ids
        FROM (
            SELECT id FROM players
            WHERE position ILIKE '%goalkeeper%'
            ORDER BY RANDOM()
            LIMIT 1
        ) sub;

        IF player_ids IS NOT NULL THEN
            selected_players := array_cat(selected_players, player_ids);
        END IF;

        -- Defenders
        SELECT array_agg(id) INTO player_ids
        FROM (
            SELECT id FROM players
            WHERE position ILIKE '%defender%'
            ORDER BY RANDOM()
            LIMIT 4
        ) sub;

        IF player_ids IS NOT NULL THEN
            selected_players := array_cat(selected_players, player_ids);
        END IF;

        -- Midfielders
        SELECT array_agg(id) INTO player_ids
        FROM (
            SELECT id FROM players
            WHERE position ILIKE '%midfielder%'
            ORDER BY RANDOM()
            LIMIT 4
        ) sub;

        IF player_ids IS NOT NULL THEN
            selected_players := array_cat(selected_players, player_ids);
        END IF;

        -- Forwards
        SELECT array_agg(id) INTO player_ids
        FROM (
            SELECT id FROM players
            WHERE position ILIKE '%forward%' OR position ILIKE '%attacker%'
            ORDER BY RANDOM()
            LIMIT 3
        ) sub;

        IF player_ids IS NOT NULL THEN
            selected_players := array_cat(selected_players, player_ids);
        END IF;

        -- 3. Insertar jugadores en team_players
        idx := 0;
        FOR players_data IN SELECT unnest(selected_players) AS player_id LOOP
            INSERT INTO team_players (team_id, player_id, is_starter, is_captain, "order", matchday)
            VALUES (
                team_id_val,
                players_data.player_id,
                TRUE,
                (idx = 0), -- Primer jugador es capitán
                idx,
                target_matchday
            );
            idx := idx + 1;
        END LOOP;

        RAISE NOTICE '11 jugadores asignados para jornada %', target_matchday;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar trigger si ya existe
DROP TRIGGER IF EXISTS on_user_confirmed_create_team ON auth.users;

-- Crear trigger que se ejecuta cuando el usuario confirma el email
-- Se dispara cuando confirmed_at se establece (antes era NULL)
CREATE TRIGGER on_user_confirmed_create_team
    AFTER UPDATE ON auth.users
    FOR EACH ROW
    WHEN (OLD.confirmed_at IS NULL AND NEW.confirmed_at IS NOT NULL)
    EXECUTE FUNCTION public.create_team_on_email_confirm();

-- ============================================
-- Alternativa: Trigger en profiles (más fiable)
-- ============================================

-- Función alternativa que se dispara al crear profile
CREATE OR REPLACE FUNCTION public.create_team_after_profile()
RETURNS TRIGGER AS $$
DECLARE
    team_id_val UUID;
    target_matchday INTEGER := 0;
    players_data RECORD;
    selected_players TEXT[];
    player_ids TEXT[];
    idx INTEGER;
BEGIN
    -- Obtener la próxima jornada futura
    SELECT matchday INTO target_matchday
    FROM fixtures
    WHERE start_time >= NOW()
    ORDER BY start_time ASC
    LIMIT 1;

    -- Si no hay jornada futura, usar 0
    IF target_matchday IS NULL THEN
        target_matchday := 0;
    END IF;

    -- Verificar si ya existe equipo para este usuario
    PERFORM 1 FROM user_teams WHERE user_id = NEW.id;
    IF FOUND THEN
        RETURN NEW; -- Ya existe equipo, no hacer nada
    END IF;

    -- 1. Crear equipo en user_teams
    INSERT INTO user_teams (user_id, name)
    VALUES (NEW.id, COALESCE(NEW.full_name, 'Mi Equipo'))
    RETURNING id INTO team_id_val;

    -- 2. Obtener 11 jugadores aleatorios
    selected_players := ARRAY[]::TEXT[];

    -- Goalkeeper
    SELECT array_agg(id) INTO player_ids
    FROM (SELECT id FROM players WHERE position ILIKE '%goalkeeper%' ORDER BY RANDOM() LIMIT 1) sub;
    IF player_ids IS NOT NULL THEN
        selected_players := array_cat(selected_players, player_ids);
    END IF;

    -- Defenders
    SELECT array_agg(id) INTO player_ids
    FROM (SELECT id FROM players WHERE position ILIKE '%defender%' ORDER BY RANDOM() LIMIT 4) sub;
    IF player_ids IS NOT NULL THEN
        selected_players := array_cat(selected_players, player_ids);
    END IF;

    -- Midfielders
    SELECT array_agg(id) INTO player_ids
    FROM (SELECT id FROM players WHERE position ILIKE '%midfielder%' ORDER BY RANDOM() LIMIT 4) sub;
    IF player_ids IS NOT NULL THEN
        selected_players := array_cat(selected_players, player_ids);
    END IF;

    -- Forwards
    SELECT array_agg(id) INTO player_ids
    FROM (SELECT id FROM players WHERE position ILIKE '%forward%' OR position ILIKE '%attacker%' ORDER BY RANDOM() LIMIT 3) sub;
    IF player_ids IS NOT NULL THEN
        selected_players := array_cat(selected_players, player_ids);
    END IF;

    -- 3. Insertar jugadores en team_players
    idx := 0;
    FOR i IN 1..array_length(selected_players, 1) LOOP
        INSERT INTO team_players (team_id, player_id, is_starter, is_captain, "order", matchday)
        VALUES (
            team_id_val,
            selected_players[i],
            TRUE,
            (idx = 0),
            idx,
            target_matchday
        );
        idx := idx + 1;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar trigger anterior si existe
DROP TRIGGER IF EXISTS on_profile_created_create_team ON public.profiles;

-- Crear trigger en profiles (se dispara después de INSERT)
CREATE TRIGGER on_profile_created_create_team
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.create_team_after_profile();
