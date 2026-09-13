-- 035_schedule_carry_over_lineups.sql
-- Programa carry_over_lineups() (migraciones 029/031) cada 15 minutos.
--
-- La función ya existía pero no se ejecutaba sola: la herencia de alineaciones
-- dependía de que cada usuario abriera el editor dentro de la ventana de
-- mercado. Con un partido adelantado eso no basta: la J6 guardó su once el
-- 1-3/09 para el Real Sociedad-Celta, y quien no entre en el editor entre el
-- final de la J5 (lun 14, 23:00) y el cierre de la J6 (mar 15, 18:00) se
-- quedaría puntuando la J6 con el once del 3 de septiembre.
--
-- Es segura de repetir: solo reescribe la jornada objetivo (la del próximo
-- partido) cuando su alineación es MÁS ANTIGUA que la de su predecesora
-- cronológica. Quien ya guardó cambios en la ventana tiene una fecha posterior
-- y no se toca. Los jugadores de equipos bloqueados por el adelantado no se
-- pueden haber cambiado en las jornadas intermedias, así que siguen siendo los
-- que jugaron ese partido.

select cron.unschedule('carry-over-lineups')
 where exists (select 1 from cron.job where jobname = 'carry-over-lineups');

select cron.schedule(
    'carry-over-lineups',
    '*/15 * * * *',
    $cron$ select public.carry_over_lineups(); $cron$
);

-- ============================================================================
-- COMPROBACIONES (ejecutar a mano en el SQL Editor tras aplicar)
--
--   select jobname, schedule, active from cron.job;
--
--   -- últimas ejecuciones y si fallaron
--   select start_time, status, return_message
--     from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'carry-over-lineups')
--    order by start_time desc limit 10;
-- ============================================================================
