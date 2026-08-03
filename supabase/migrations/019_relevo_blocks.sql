-- 019_relevo_blocks: desglose del nuevo sistema de Puntos RELEVO por bloques.
--
-- El motor (frontend-web/trigger_descarga_eventos.py) pasó de 7 categorías
-- globales a 4 bloques específicos por posición: cada bloque superado suma
-- 1 punto y, si no se supera ninguno, la puntuación RELEVO es -1.
--
-- Hasta ahora sólo se guardaba el agregado `relevo_points`, así que la ficha
-- del jugador en Partidos no podía explicar QUÉ bloque se superó ni con qué
-- valores. Añadimos:
--   1) el punto obtenido en cada uno de los 4 bloques, y
--   2) las métricas crudas que alimentan esos bloques y que aún no existían
--      como columna (calidad de parada, duelos por el suelo, remates a balón
--      parado, remates de cabeza, recuperaciones en campo rival, acciones de
--      último hombre y pases en campo rival).
--
-- Las columnas antiguas (relevo_participation_pts, relevo_passes_pts, …) se
-- conservan para no romper las jornadas ya sincronizadas, pero el motor deja
-- de escribirlas.
--
-- Tras aplicar: re-sincronizar los partidos ya disputados para poblarlas.

-- Puntos por bloque (0 o 1 cada uno).
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS relevo_block_1_pts NUMERIC(4,2) DEFAULT 0;
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS relevo_block_2_pts NUMERIC(4,2) DEFAULT 0;
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS relevo_block_3_pts NUMERIC(4,2) DEFAULT 0;
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS relevo_block_4_pts NUMERIC(4,2) DEFAULT 0;

-- Métricas crudas nuevas usadas por los bloques.
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS calidad_parada NUMERIC(6,2) DEFAULT 0;
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS pass_opp_half_attempted INTEGER DEFAULT 0;
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS pass_opp_half_completed INTEGER DEFAULT 0;
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS ground_duels_won   INTEGER DEFAULT 0;
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS ground_duels_total INTEGER DEFAULT 0;
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS def_actions_last_man INTEGER DEFAULT 0;
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS set_piece_shots      INTEGER DEFAULT 0;
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS header_shots         INTEGER DEFAULT 0;
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS recoveries_opp_half  INTEGER DEFAULT 0;
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS shots_total          INTEGER DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Reglas de puntuación (scoring_config): el motor lee de aquí y sólo cae al
-- scoring_rules.json del repo si Supabase falla, así que la fila id=1 tiene que
-- reflejar el sistema nuevo o el sync seguiría puntuando con el viejo.
--
--   · `bonuses_per_X` y `relevo_rules` desaparecen (el motor ya no los lee).
--   · `relevo_limits` aporta los umbrales de los 4 bloques por posición.
--   · despejes, tiros a puerta, regates y balones al área pasan a `events`,
--     que es de donde el motor los cobra ahora (antes valían 0).
--   · se retiran punch_ok / punch_fail / claim / sweeper: ya no puntúan por
--     unidad, sólo alimentan el bloque 4 del portero.
-- ---------------------------------------------------------------------------
UPDATE scoring_config
SET rules = (
      (rules - 'bonuses_per_X' - 'relevo_rules')
      || jsonb_build_object(
           'version', '4.0 - RELEVO Bloques',
           'events', (rules->'events') - 'punch_ok' - 'punch_fail' - 'claim' - 'sweeper' || jsonb_build_object(
             'clearances',      jsonb_build_object('all', 0.5, 'description', 'Por cada despeje (typeId 12)'),
             'shots_on_target', jsonb_build_object('all', 0.3, 'description', 'Por cada tiro a puerta (typeId 15)'),
             'takeons_won',     jsonb_build_object('all', 0.5, 'description', 'Por cada regate completado (typeId 3, outcome 1)'),
             'box_entries',     jsonb_build_object('all', 0.1, 'description', 'Por cada pase que acaba en el área (end_x > 83 y end_y entre 21.1 y 78.9)')
           ),
           'relevo_limits', jsonb_build_object(
             'POR', jsonb_build_object(
               'saves_per_min', 0.06,
               'calidad_parada_multiplier', 0.5,
               'long_passes_per_min', 0.05,
               'pass_pct', 65,
               'pass_att_per_min', 0.3,
               'claims_per_min', 0.02,
               'punches_per_min', 0.03
             ),
             'DEF', jsonb_build_object(
               'last_man_per_min', 0.02,
               'long_passes_per_min', 0.05,
               'forward_passes_per_min', 0.05,
               'aerials_pct', 60,
               'ground_duels_pct', 60,
               'abp_remates_per_min', 0.01,
               'crosses_per_min', 0.02
             ),
             'MED', jsonb_build_object(
               'pass_opp_pct', 50,
               'aerials_pct', 60,
               'ground_duels_pct', 60,
               'shots_on_pct', 50,
               'takeons_pct', 35,
               'assists_per_min', 0.03,
               'crosses_per_min', 0.02
             ),
             'DEL', jsonb_build_object(
               'pass_opp_pct', 50,
               'aerials_pct', 40,
               'recup_opp_per_min', 0.3,
               'shots_on_pct', 60,
               'head_shots_per_min', 0.02,
               'assists_per_min', 0.03,
               'takeons_pct', 35
             )
           )
         )
    ),
    updated_at = NOW()
WHERE id = 1;
