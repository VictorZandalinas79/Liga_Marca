-- Migración 002: Actualizar tabla player_scores con todas las métricas de Fantasy
-- Ejecutar en Supabase SQL Editor

-- Primero, eliminamos la tabla si existe para recrearla con la estructura completa
DROP TABLE IF EXISTS player_scores CASCADE;

-- Creamos la nueva tabla player_scores con TODAS las métricas
CREATE TABLE IF NOT EXISTS player_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id TEXT REFERENCES players(id),
    fixture_id TEXT REFERENCES fixtures(id),
    match_id TEXT NOT NULL,

    -- Datos básicos
    team_id TEXT NOT NULL,
    position TEXT NOT NULL, -- POR, DEF, MED, DEL
    is_starter BOOLEAN DEFAULT FALSE,
    minutes_played INTEGER DEFAULT 0,

    -- Puntuación total
    total_points NUMERIC(10, 2) DEFAULT 6.5, -- Base score

    -- GOLES Y PORTERÍA
    goals INTEGER DEFAULT 0,
    goal_header_bonus INTEGER DEFAULT 0,
    goal_freekick_bonus INTEGER DEFAULT 0,
    own_goals INTEGER DEFAULT 0,
    goals_conceded INTEGER DEFAULT 0,
    clean_sheet BOOLEAN DEFAULT FALSE,

    -- ASISTENCIAS Y PASES CLAVE
    assists INTEGER DEFAULT 0,
    key_passes INTEGER DEFAULT 0,
    second_assists INTEGER DEFAULT 0,
    intent_assists INTEGER DEFAULT 0,

    -- TIROS
    shots_on_target INTEGER DEFAULT 0,
    shots_off_target INTEGER DEFAULT 0,
    shots_hit_woodwork INTEGER DEFAULT 0,
    big_chances_created INTEGER DEFAULT 0,
    big_chances_missed INTEGER DEFAULT 0,
    penalties_scored INTEGER DEFAULT 0,
    penalties_missed INTEGER DEFAULT 0,

    -- PENALTIS (ganados/encajados)
    penalties_won INTEGER DEFAULT 0,
    penalties_conceded INTEGER DEFAULT 0,

    -- PORTERÍA (solo POR)
    saves INTEGER DEFAULT 0,
    penalty_saves INTEGER DEFAULT 0,
    claims_ok INTEGER DEFAULT 0,
    claims_fail INTEGER DEFAULT 0,
    fumbles INTEGER DEFAULT 0,
    crosses_not_claimed INTEGER DEFAULT 0,
    punches_ok INTEGER DEFAULT 0,
    punches_fail INTEGER DEFAULT 0,
    smothers INTEGER DEFAULT 0,
    sweepers_ok INTEGER DEFAULT 0,
    sweepers_fail INTEGER DEFAULT 0,
    parries_safe INTEGER DEFAULT 0,
    parries_danger INTEGER DEFAULT 0,

    -- DEFENSA
    clearances INTEGER DEFAULT 0,
    clearances_last_line INTEGER DEFAULT 0,
    blocked_crosses INTEGER DEFAULT 0,
    interceptions INTEGER DEFAULT 0,
    tackles_won INTEGER DEFAULT 0,
    tackles_lost INTEGER DEFAULT 0,
    blocked_shots INTEGER DEFAULT 0,
    blocked_passes INTEGER DEFAULT 0,
    ball_recoveries INTEGER DEFAULT 0,
    offsides_provoked INTEGER DEFAULT 0,
    challenges_lost INTEGER DEFAULT 0,

    -- ERRORES
    errors_leading_to_shot INTEGER DEFAULT 0,
    errors_leading_to_goal INTEGER DEFAULT 0,

    -- PASES
    passes_completed INTEGER DEFAULT 0,
    passes_attempted INTEGER DEFAULT 0,
    pass_accuracy NUMERIC(5, 2) DEFAULT 0,
    progressive_passes INTEGER DEFAULT 0,
    passes_into_final_third INTEGER DEFAULT 0,
    passes_into_box INTEGER DEFAULT 0,
    through_balls INTEGER DEFAULT 0,
    crosses_completed INTEGER DEFAULT 0,
    crosses_attempted INTEGER DEFAULT 0,
    switch_plays INTEGER DEFAULT 0,
    pull_backs INTEGER DEFAULT 0,
    long_balls_completed INTEGER DEFAULT 0,
    lay_offs INTEGER DEFAULT 0,
    offside_passes INTEGER DEFAULT 0,

    -- REGATES Y TÉCNICA
    takeons_won INTEGER DEFAULT 0,
    takeons_lost INTEGER DEFAULT 0,
    takeons_overrun INTEGER DEFAULT 0,
    good_skills INTEGER DEFAULT 0,
    dispossessed INTEGER DEFAULT 0,
    bad_touches INTEGER DEFAULT 0,

    -- DUELOS AÉREOS
    aerials_won INTEGER DEFAULT 0,
    aerials_lost INTEGER DEFAULT 0,
    aerial_success_rate NUMERIC(5, 2) DEFAULT 0,

    -- FALTAS
    fouls_committed INTEGER DEFAULT 0,
    fouls_won INTEGER DEFAULT 0,

    -- TARJETAS
    yellow_cards INTEGER DEFAULT 0,
    second_yellow_cards INTEGER DEFAULT 0,
    red_cards INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_player_scores_player_id ON player_scores(player_id);
CREATE INDEX IF NOT EXISTS idx_player_scores_fixture_id ON player_scores(fixture_id);
CREATE INDEX IF NOT EXISTS idx_player_scores_match_id ON player_scores(match_id);
CREATE INDEX IF NOT EXISTS idx_player_scores_team_id ON player_scores(team_id);
CREATE INDEX IF NOT EXISTS idx_player_scores_total_points ON player_scores(total_points DESC);

-- Vista para stats acumuladas por jugador
CREATE OR REPLACE VIEW player_season_stats AS
SELECT
    player_id,
    COUNT(*) as matches_played,
    SUM(minutes_played) as total_minutes,
    SUM(total_points) as total_points,
    ROUND(AVG(total_points), 2) as avg_points,
    SUM(goals) as total_goals,
    SUM(assists) as total_assists,
    SUM(yellow_cards) as total_yellow_cards,
    SUM(red_cards) as total_red_cards,
    SUM(clean_sheet::int) as total_clean_sheets
FROM player_scores
GROUP BY player_id;

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at en player_scores
DROP TRIGGER IF EXISTS update_player_scores_updated_at ON player_scores;
CREATE TRIGGER update_player_scores_updated_at
    BEFORE UPDATE ON player_scores
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
