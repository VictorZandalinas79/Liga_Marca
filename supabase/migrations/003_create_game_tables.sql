-- ============================================
-- TABLAS PRINCIPALES DEL JUEGO
-- ============================================

-- 1. Tabla de perfiles de usuario (extiende auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- 2. Tabla de equipos de los usuarios
CREATE TABLE IF NOT EXISTS user_teams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_teams_user_id ON user_teams(user_id);

-- 3. Tabla de jugadores de equipo (relación equipo-jugador)
CREATE TABLE IF NOT EXISTS team_players (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID REFERENCES user_teams(id) ON DELETE CASCADE NOT NULL,
    player_id TEXT REFERENCES players(id) NOT NULL,
    is_starter BOOLEAN DEFAULT FALSE,
    is_captain BOOLEAN DEFAULT FALSE,
    "order" INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_team_players_team_id ON team_players(team_id);
CREATE INDEX IF NOT EXISTS idx_team_players_player_id ON team_players(player_id);

-- 4. Tabla de configuración del juego
CREATE TABLE IF NOT EXISTS game_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    current_matchday INTEGER DEFAULT 1,
    mode TEXT DEFAULT 'edit' CHECK (mode IN ('edit', 'live', 'finished')),
    edit_deadline TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar configuración inicial
INSERT INTO game_settings (current_matchday, mode) VALUES (1, 'edit')
ON CONFLICT DO NOTHING;

-- 5. Tabla de puntuaciones de jugadores por jornada
CREATE TABLE IF NOT EXISTS player_scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fixture_id TEXT REFERENCES fixtures(id),
    player_id TEXT REFERENCES players(id) NOT NULL,
    team_id UUID REFERENCES user_teams(id),
    matchday INTEGER NOT NULL,
    goals INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    yellow_cards INTEGER DEFAULT 0,
    red_cards INTEGER DEFAULT 0,
    minutes_played INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_scores_matchday ON player_scores(matchday);
CREATE INDEX IF NOT EXISTS idx_player_scores_player_id ON player_scores(player_id);
CREATE INDEX IF NOT EXISTS idx_player_scores_fixture_id ON player_scores(fixture_id);

-- 6. Tabla de sanciones/multas
CREATE TABLE IF NOT EXISTS penalties (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID REFERENCES user_teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id),
    matchday INTEGER NOT NULL,
    description TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_penalties_matchday ON penalties(matchday);
CREATE INDEX IF NOT EXISTS idx_penalties_team_id ON penalties(team_id);

-- 7. Tabla de eventos de partido (goles, tarjetas, etc.)
CREATE TABLE IF NOT EXISTS match_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fixture_id TEXT REFERENCES fixtures(id) ON DELETE CASCADE,
    player_id TEXT REFERENCES players(id),
    team_id TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN ('goal', 'assist', 'yellow_card', 'red_card', 'substitution', 'own_goal')),
    minute INTEGER NOT NULL,
    extra_minute INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_events_fixture_id ON match_events(fixture_id);
CREATE INDEX IF NOT EXISTS idx_match_events_player_id ON match_events(player_id);

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Vista para clasificación general
CREATE OR REPLACE VIEW standings AS
SELECT
    ut.id as team_id,
    ut.name as team_name,
    ut.user_id,
    p.full_name,
    COALESCE(SUM(ps.total_points), 0) as total_points,
    COALESCE(SUM(ps.goals), 0) as total_goals,
    COALESCE((SELECT SUM(points) FROM penalties WHERE team_id = ut.id), 0) as total_penalties,
    COALESCE(SUM(ps.total_points), 0) - COALESCE((SELECT SUM(points) FROM penalties WHERE team_id = ut.id), 0) as net_points
FROM user_teams ut
LEFT JOIN profiles p ON ut.user_id = p.id
LEFT JOIN team_players tp ON ut.id = tp.team_id
LEFT JOIN player_scores ps ON tp.player_id = ps.player_id
GROUP BY ut.id, ut.name, ut.user_id, p.full_name
ORDER BY net_points DESC;

-- Vista para equipo con jugadores
CREATE OR REPLACE VIEW team_with_players AS
SELECT
    ut.id,
    ut.name,
    ut.user_id,
    tp.player_id,
    tp.is_starter,
    tp.is_captain,
    tp."order",
    pl.first_name,
    pl.last_name,
    pl.short_name,
    pl.position,
    pl.photo,
    pl.shirt_number,
    pl.team_id as real_team_id
FROM user_teams ut
LEFT JOIN team_players tp ON ut.id = tp.team_id
LEFT JOIN players pl ON tp.player_id = pl.id
ORDER BY tp."order";

-- ============================================
-- FUNCIONES
-- ============================================

-- Función para obtener el modo de juego actual
CREATE OR REPLACE FUNCTION get_game_mode()
RETURNS TEXT AS $$
BEGIN
    RETURN (SELECT mode FROM game_settings LIMIT 1);
END;
$$ LANGUAGE plpgsql;

-- Función para verificar si un usuario puede hacer cambios
CREATE OR REPLACE FUNCTION can_make_changes(team_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    game_mode TEXT;
    is_owner BOOLEAN;
    deadline TIMESTAMPTZ;
BEGIN
    -- Obtener modo de juego
    SELECT mode, edit_deadline INTO game_mode, deadline FROM game_settings LIMIT 1;

    -- Verificar si es dueño del equipo
    SELECT (user_id = auth.uid()) INTO is_owner FROM user_teams WHERE id = team_id;

    -- Solo puede cambiar si está en modo edición y es el dueño
    IF game_mode = 'edit' AND is_owner THEN
        -- Si hay deadline, verificar que no haya pasado
        IF deadline IS NULL OR deadline > NOW() THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

-- Políticas para profiles
CREATE POLICY "Public profiles are viewable by everyone"
    ON profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Políticas para user_teams
CREATE POLICY "Teams are viewable by everyone"
    ON user_teams FOR SELECT
    USING (true);

CREATE POLICY "Users can create own team"
    ON user_teams FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own team"
    ON user_teams FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own team"
    ON user_teams FOR DELETE
    USING (auth.uid() = user_id);

-- Políticas para team_players
CREATE POLICY "Team players viewable by everyone"
    ON team_players FOR SELECT
    USING (true);

CREATE POLICY "Users can manage players in own team"
    ON team_players FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_teams
            WHERE id = team_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update players in own team"
    ON team_players FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_teams
            WHERE id = team_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete players from own team"
    ON team_players FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_teams
            WHERE id = team_id AND user_id = auth.uid()
        )
    );

-- Políticas para game_settings
CREATE POLICY "Game settings viewable by everyone"
    ON game_settings FOR SELECT
    USING (true);

-- Solo admin puede actualizar configuración (implementar según necesidad)
CREATE POLICY "Game settings updateable by admin"
    ON game_settings FOR UPDATE
    USING (true); -- Cambiar a condición de admin si es necesario

-- Políticas para player_scores
CREATE POLICY "Player scores viewable by everyone"
    ON player_scores FOR SELECT
    USING (true);

-- Políticas para penalties
CREATE POLICY "Penalties viewable by everyone"
    ON penalties FOR SELECT
    USING (true);

CREATE POLICY "Admin can manage penalties"
    ON penalties FOR ALL
    USING (true); -- Cambiar a condición de admin si es necesario

-- Políticas para match_events
CREATE POLICY "Match events viewable by everyone"
    ON match_events FOR SELECT
    USING (true);

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_teams_updated_at
    BEFORE UPDATE ON user_teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_players_updated_at
    BEFORE UPDATE ON team_players
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_player_scores_updated_at
    BEFORE UPDATE ON player_scores
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para crear profile automáticamente al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name'
    )
    ON CONFLICT (id) DO UPDATE SET
        email = NEW.email,
        full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', profiles.full_name);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
