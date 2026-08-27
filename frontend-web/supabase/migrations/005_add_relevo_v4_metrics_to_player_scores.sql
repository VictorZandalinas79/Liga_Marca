-- ============================================
-- Añade las métricas crudas del motor RELEVO v4 a player_scores
--
-- El motor de puntuación (trigger_descarga_eventos.py) fue actualizado para
-- calcular los 4 bloques RELEVO con las nuevas reglas calibradas en
-- analizar_metricas_relevo.py. Estas columnas nuevas alimentan el desglose
-- visual del frontend (evaluateRelevoBlocks en scoring-config.ts).
-- ============================================

ALTER TABLE player_scores
    ADD COLUMN IF NOT EXISTS saves_gte_07 integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS def_actions_12_8_49_42_7 integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS def_actions_opp_half_12_8_49_42_7 integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS off_actions_3_4_outcome_1 integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS off_actions_opp_half_outcome_1 integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS intercept_recup_3_4 integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS recoveries_49 integer NOT NULL DEFAULT 0;
