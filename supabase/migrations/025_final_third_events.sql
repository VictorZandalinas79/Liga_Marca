-- 025_final_third_events: columna para el nuevo criterio del Bloque 1 de Delanteros
-- (Puntos RELEVO): participaciones en 3/4 de campo (x > 66.6) por minuto jugado.
--
-- El motor ya calculaba y aplicaba esta condición internamente, pero no
-- persistía el recuento crudo en player_scores, por lo que el desglose de la
-- ficha del jugador mostraba siempre 0 aunque el bloque se hubiera superado
-- por esta vía.
--
-- Tras aplicar: re-sincronizar los partidos ya disputados para poblar la columna.

ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS final_third_events INTEGER DEFAULT 0;
