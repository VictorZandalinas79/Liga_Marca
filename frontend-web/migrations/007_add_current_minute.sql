-- Minuto del último evento sincronizado del partido.
-- El motor (trigger_descarga_eventos.py) guarda aquí el mayor timeMin de los
-- eventos procesados, para que la ficha del partido en vivo muestre el minuto
-- real de los datos subidos en lugar de calcularlo con el reloj del navegador.
ALTER TABLE fixtures
ADD COLUMN IF NOT EXISTS current_minute INTEGER DEFAULT 0;
