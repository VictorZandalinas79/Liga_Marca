-- Tabla para almacenar los escudos de los equipos
CREATE TABLE IF NOT EXISTS team_badges (
    team_id TEXT PRIMARY KEY,
    badge_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentario de la tabla
COMMENT ON TABLE team_badges IS 'Almacena la URL del escudo de cada equipo desde Opta';
COMMENT ON COLUMN team_badges.team_id IS 'ID del equipo en real_teams';
COMMENT ON COLUMN team_badges.badge_url IS 'URL del escudo del equipo (formato Opta)';

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_team_badges_updated_at
    BEFORE UPDATE ON team_badges
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Tabla players (crear si no existe y añadir columnas nuevas si faltan)
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    team_id TEXT REFERENCES real_teams(id),
    first_name TEXT,
    last_name TEXT,
    short_name TEXT,
    position TEXT,
    status TEXT,
    photo TEXT,
    date_of_birth DATE,
    nationality TEXT,
    height INTEGER,
    weight INTEGER,
    foot TEXT,
    shirt_number INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentario de la tabla
COMMENT ON TABLE players IS 'Jugadores de los equipos reales con sus datos y fotos';
COMMENT ON COLUMN players.photo IS 'Foto del jugador en base64. Si es NULL, usar el escudo del equipo.';

-- Trigger para actualizar updated_at en players
CREATE TRIGGER update_players_updated_at
    BEFORE UPDATE ON players
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Índice para buscar por equipo
CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id);

-- Índice para buscar por nombre
CREATE INDEX IF NOT EXISTS idx_players_short_name ON players(short_name);
