-- 012_secure_team_ownership_and_audit.sql
--
-- Contexto: usuarios reportaron que su plantilla de 11 jugadores cambiaba
-- "sola", sin que ellos tocaran nada. Auditoría encontró la causa raíz:
--
-- 1) save_team_lineup() es SECURITY DEFINER (corre con privilegios del
--    owner de la función) y NUNCA comprobaba que auth.uid() fuera el dueño
--    del team_id recibido. Las políticas RLS de team_players sí exigen
--    "user_id = auth.uid()", pero al pasar por esta función con privilegios
--    elevados, esa comprobación quedaba completamente bypaseada: cualquier
--    sesión autenticada podía (por bug de frontend o intencionadamente)
--    llamar al RPC con el team_id de OTRO usuario y sobrescribir su
--    alineación entera.
-- 2) game_settings (UPDATE) y penalties (ALL) tenían políticas RLS con
--    "USING (true)" literal, con el propio comentario de origen diciendo
--    "cambiar a condición de admin si es necesario" — nunca se hizo.
--    Cualquier usuario autenticado podía en teoría cambiar el modo de
--    juego, el deadline, o crear/borrar sanciones de cualquier equipo.
-- 3) No existía ninguna tabla de auditoría: era imposible saber en la BD
--    quién o qué proceso cambió una plantilla. Esto también es la base
--    técnica para poder registrar de forma fiable, jornada a jornada,
--    quién entra y quién sale de cada plantilla.
--
-- Este fichero corrige los tres puntos.

-- ============================================================
-- 1) Tabla de auditoría de team_players
-- ============================================================

CREATE TABLE IF NOT EXISTS team_players_audit (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID NOT NULL,
    matchday INTEGER,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    player_id_old TEXT,
    player_id_new TEXT,
    is_starter_old BOOLEAN,
    is_starter_new BOOLEAN,
    replaced_player_id_old TEXT,
    replaced_player_id_new TEXT,
    -- actor: auth.uid() si viene de una sesión de usuario normal,
    -- o el nombre del proceso (ej. 'trigger_descarga_eventos',
    -- 'merge_players_data', 'service_role') cuando lo setee un script
    -- vía set_config('lfm.actor', '<nombre>', true) antes de escribir.
    actor UUID,
    actor_label TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_players_audit_team_matchday
    ON team_players_audit(team_id, matchday);
CREATE INDEX IF NOT EXISTS idx_team_players_audit_created_at
    ON team_players_audit(created_at);

ALTER TABLE team_players_audit ENABLE ROW LEVEL SECURITY;

-- El histórico de la propia plantilla lo puede ver su dueño; los admin ven todo.
CREATE POLICY "Users can view own team audit"
    ON team_players_audit FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_teams
            WHERE id = team_id AND user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE
        )
    );
-- Nadie escribe directamente en la tabla de auditoría salvo el propio
-- trigger (que corre como SECURITY DEFINER internamente vía la función).
-- No se crea ninguna política de INSERT/UPDATE/DELETE para authenticated.

CREATE OR REPLACE FUNCTION log_team_players_change()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_label TEXT;
BEGIN
    v_actor_label := current_setting('lfm.actor', true);

    IF TG_OP = 'DELETE' THEN
        INSERT INTO team_players_audit (
            team_id, matchday, action,
            player_id_old, is_starter_old, replaced_player_id_old,
            actor, actor_label
        ) VALUES (
            OLD.team_id, OLD.matchday, 'DELETE',
            OLD.player_id, OLD.is_starter, OLD.replaced_player_id,
            auth.uid(), v_actor_label
        );
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO team_players_audit (
            team_id, matchday, action,
            player_id_old, player_id_new,
            is_starter_old, is_starter_new,
            replaced_player_id_old, replaced_player_id_new,
            actor, actor_label
        ) VALUES (
            NEW.team_id, NEW.matchday, 'UPDATE',
            OLD.player_id, NEW.player_id,
            OLD.is_starter, NEW.is_starter,
            OLD.replaced_player_id, NEW.replaced_player_id,
            auth.uid(), v_actor_label
        );
        RETURN NEW;
    ELSE
        INSERT INTO team_players_audit (
            team_id, matchday, action,
            player_id_new, is_starter_new, replaced_player_id_new,
            actor, actor_label
        ) VALUES (
            NEW.team_id, NEW.matchday, 'INSERT',
            NEW.player_id, NEW.is_starter, NEW.replaced_player_id,
            auth.uid(), v_actor_label
        );
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_team_players_change ON team_players;
CREATE TRIGGER trg_log_team_players_change
    AFTER INSERT OR UPDATE OR DELETE ON team_players
    FOR EACH ROW
    EXECUTE FUNCTION log_team_players_change();

-- ============================================================
-- 2) save_team_lineup: verificar propiedad del equipo antes de escribir
-- ============================================================

CREATE OR REPLACE FUNCTION save_team_lineup(
    p_team_id UUID,
    p_matchday INT,
    p_players JSONB
) RETURNS void AS $$
DECLARE
    v_owner UUID;
BEGIN
    IF jsonb_array_length(p_players) <> 11 THEN
        RAISE EXCEPTION 'La alineación debe tener exactamente 11 jugadores (recibidos: %)', jsonb_array_length(p_players);
    END IF;

    SELECT user_id INTO v_owner FROM user_teams WHERE id = p_team_id;

    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'Equipo % no existe', p_team_id;
    END IF;

    -- auth.uid() es NULL cuando la llamada viene de service_role (scripts
    -- de backend con la service key), que sí tiene permiso pleno. Cuando
    -- viene de una sesión de usuario normal (rol authenticated/anon),
    -- auth.uid() debe coincidir con el dueño del equipo.
    IF auth.uid() IS NOT NULL AND auth.uid() <> v_owner THEN
        RAISE EXCEPTION 'No autorizado: el equipo % no pertenece al usuario actual', p_team_id;
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

-- ============================================================
-- 3) Cerrar policies "USING (true)" de game_settings y penalties
-- ============================================================

DROP POLICY IF EXISTS "Game settings updateable by admin" ON game_settings;
CREATE POLICY "Game settings updateable by admin"
    ON game_settings FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

DROP POLICY IF EXISTS "Admin can manage penalties" ON penalties;
CREATE POLICY "Admin can manage penalties"
    ON penalties FOR ALL
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );
