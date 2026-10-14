-- ============================================================================
-- 038_cleanup_audit_logs.sql
--
-- Limpieza y mantenimiento periódico de team_players_audit.
--
-- POR QUÉ:
-- La tabla team_players_audit almacena los cambios en alineaciones.
-- Con el tiempo creció hasta casi 40.000 filas y 10 MB (la más pesada de la BD).
-- Para no saturar los 500 MB del plan Free ni ralentizar índices, mantenemos
-- los últimos 14 días (suficiente para revisar cualquier cambio o disputa)
-- y purgamos automáticamente los registros antiguos cada noche.
-- ============================================================================

-- Purgar registros de más de 14 días
DELETE FROM public.team_players_audit
 WHERE created_at < NOW() - INTERVAL '14 days';

-- Desprogramar si ya existiera
SELECT cron.unschedule('team-players-audit-cleanup')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'team-players-audit-cleanup');

-- Programar limpieza diaria a las 04:23 AM UTC
SELECT cron.schedule(
    'team-players-audit-cleanup',
    '23 4 * * *',
    $cron$ DELETE FROM public.team_players_audit WHERE created_at < NOW() - INTERVAL '14 days'; $cron$
);
