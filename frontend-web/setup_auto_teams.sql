-- ============================================
-- AUTOMATIZAR EQUIPOS
--   A) Al registrarse: crear equipo + 11 jugadores aleatorios
--   B) Al pasar de jornada: heredar la alineación de la jornada anterior
-- Ejecutar ENTERO en el SQL Editor de Supabase
-- (Requiere haber ejecutado antes add_phone_to_profiles.sql)
-- ============================================


-- ============================================
-- A) CREAR EQUIPO + 11 JUGADORES AL REGISTRARSE
-- ============================================
CREATE OR REPLACE FUNCTION public.create_team_for_new_profile()
RETURNS TRIGGER AS $$
DECLARE
    team_id_val UUID;
    target_matchday INTEGER;
    pid public.players.id%TYPE;
    idx INTEGER := 0;
BEGIN
    -- Idempotente: si el usuario ya tiene equipo, no hacer nada
    PERFORM 1 FROM public.user_teams WHERE user_id = NEW.id;
    IF FOUND THEN RETURN NEW; END IF;

    -- Jornada objetivo: próxima jornada futura (>0); si no, la máxima; si no, 1
    SELECT matchday INTO target_matchday
    FROM public.fixtures WHERE start_time >= NOW() AND matchday > 0
    ORDER BY start_time ASC LIMIT 1;
    IF target_matchday IS NULL THEN
        SELECT MAX(matchday) INTO target_matchday FROM public.fixtures WHERE matchday > 0;
    END IF;
    IF target_matchday IS NULL THEN target_matchday := 1; END IF;

    -- Crear el equipo
    INSERT INTO public.user_teams (user_id, name)
    VALUES (NEW.id, COALESCE(NEW.full_name, 'Mi Equipo'))
    RETURNING id INTO team_id_val;

    -- 1 portero (capitán), 4 defensas, 4 medios, 3 delanteros
    FOR pid IN SELECT id FROM public.players WHERE position ILIKE '%goalkeeper%' ORDER BY RANDOM() LIMIT 1 LOOP
        INSERT INTO public.team_players (team_id, player_id, is_starter, is_captain, "order", matchday)
        VALUES (team_id_val, pid, TRUE, (idx = 0), idx, target_matchday);
        idx := idx + 1;
    END LOOP;
    FOR pid IN SELECT id FROM public.players WHERE position ILIKE '%defender%' ORDER BY RANDOM() LIMIT 4 LOOP
        INSERT INTO public.team_players (team_id, player_id, is_starter, is_captain, "order", matchday)
        VALUES (team_id_val, pid, TRUE, FALSE, idx, target_matchday);
        idx := idx + 1;
    END LOOP;
    FOR pid IN SELECT id FROM public.players WHERE position ILIKE '%midfielder%' ORDER BY RANDOM() LIMIT 4 LOOP
        INSERT INTO public.team_players (team_id, player_id, is_starter, is_captain, "order", matchday)
        VALUES (team_id_val, pid, TRUE, FALSE, idx, target_matchday);
        idx := idx + 1;
    END LOOP;
    FOR pid IN SELECT id FROM public.players WHERE position ILIKE '%forward%' OR position ILIKE '%attacker%' ORDER BY RANDOM() LIMIT 2 LOOP
        INSERT INTO public.team_players (team_id, player_id, is_starter, is_captain, "order", matchday)
        VALUES (team_id_val, pid, TRUE, FALSE, idx, target_matchday);
        idx := idx + 1;
    END LOOP;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Nunca bloquear el registro por un fallo aquí
    RAISE WARNING 'create_team_for_new_profile: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Limpiar triggers antiguos que pudieran duplicar equipos y dejar UNO solo
DROP TRIGGER IF EXISTS on_user_confirmed_create_team ON auth.users;
DROP TRIGGER IF EXISTS on_profile_created_create_team ON public.profiles;
CREATE TRIGGER on_profile_created_create_team
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.create_team_for_new_profile();


-- ============================================
-- B) HEREDAR ALINEACIÓN AL PASAR DE JORNADA
--    Para cada equipo sin alineación en la jornada objetivo,
--    copia la de su jornada anterior más reciente (mismos 11).
-- ============================================
CREATE OR REPLACE FUNCTION public.carry_over_lineups()
RETURNS void AS $$
DECLARE
    target_matchday INTEGER;
    t RECORD;
    prev_matchday INTEGER;
BEGIN
    -- Jornada objetivo: próxima jornada futura (>0); si no, la máxima
    SELECT matchday INTO target_matchday
    FROM public.fixtures WHERE start_time >= NOW() AND matchday > 0
    ORDER BY start_time ASC LIMIT 1;
    IF target_matchday IS NULL THEN
        SELECT MAX(matchday) INTO target_matchday FROM public.fixtures WHERE matchday > 0;
    END IF;
    IF target_matchday IS NULL THEN RETURN; END IF;

    FOR t IN SELECT id FROM public.user_teams LOOP
        -- ¿ya tiene alineación en la jornada objetivo?
        PERFORM 1 FROM public.team_players WHERE team_id = t.id AND matchday = target_matchday LIMIT 1;
        IF FOUND THEN CONTINUE; END IF;

        -- jornada anterior más reciente con alineación
        SELECT MAX(matchday) INTO prev_matchday
        FROM public.team_players
        WHERE team_id = t.id AND matchday < target_matchday;
        IF prev_matchday IS NULL THEN CONTINUE; END IF;

        -- copiar los mismos 11 a la nueva jornada
        INSERT INTO public.team_players (team_id, player_id, is_starter, is_captain, "order", matchday)
        SELECT team_id, player_id, is_starter, is_captain, "order", target_matchday
        FROM public.team_players
        WHERE team_id = t.id AND matchday = prev_matchday
        ON CONFLICT (team_id, player_id, matchday) DO NOTHING;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ejecutar una vez ahora para rellenar la jornada actual
SELECT public.carry_over_lineups();

-- ---- AUTOMATIZACIÓN (recomendado) -----------------------------------------
-- Para que la herencia ocurra sola cada hora hace falta la extensión pg_cron.
-- 1) Actívala en Supabase: Database -> Extensions -> habilitar "pg_cron".
-- 2) Programa el trabajo (descomenta esta línea y ejecútala):
--
-- SELECT cron.schedule('carry-over-lineups', '0 * * * *',
--                      $$ SELECT public.carry_over_lineups(); $$);
--
-- Así, en cuanto una jornada termina y la siguiente pasa a ser la próxima,
-- todos los usuarios reciben automáticamente sus 11 de la jornada anterior.
-- ---------------------------------------------------------------------------
