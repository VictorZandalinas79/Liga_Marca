-- 045_prevent_future_fixtures_completed.sql
--
-- Regla de integridad:
-- Ningún partido que tenga hora de inicio en el futuro (start_time > NOW())
-- puede guardarse como terminado ('finished', 'played', 'completed') ni tener goles o minuto asignado.
--
-- Si por error un script de sincronización, prueba o webhook intenta insertar o
-- actualizar un fixture futuro con resultado o estado terminado, este trigger
-- lo corrige automáticamente a 'scheduled' (o 'postponed'/'cancelled' si procedía),
-- dejando home_score = NULL, away_score = NULL y current_minute = NULL.

CREATE OR REPLACE FUNCTION public.clean_future_fixture()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Si la hora de inicio es futura (con 1 minuto de gracia por desfase de reloj)
    IF NEW.start_time IS NOT NULL AND NEW.start_time > (NOW() + INTERVAL '1 minute') THEN
        -- No puede estar en live ni finished:
        IF LOWER(COALESCE(NEW.status, '')) IN ('finished', 'ft', 'completed', 'played', 'live', '1h', '2h', 'ht', 'in play', 'playing') THEN
            NEW.status := 'scheduled';
        END IF;

        -- No puede tener goles ni minuto de juego si aún no empezó:
        NEW.home_score := NULL;
        NEW.away_score := NULL;
        NEW.current_minute := NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clean_future_fixture ON public.fixtures;

CREATE TRIGGER trg_clean_future_fixture
    BEFORE INSERT OR UPDATE ON public.fixtures
    FOR EACH ROW
    EXECUTE FUNCTION public.clean_future_fixture();

-- Limpieza automática inmediata de todos los fixtures que tengan fecha futura
-- y hayan quedado con resultados o estados anómalos:
UPDATE public.fixtures
SET 
    status = CASE 
        WHEN LOWER(COALESCE(status, '')) IN ('finished', 'ft', 'completed', 'played', 'live') THEN 'scheduled'
        ELSE status
    END,
    home_score = NULL,
    away_score = NULL,
    current_minute = NULL
WHERE start_time IS NOT NULL 
  AND start_time > NOW();

