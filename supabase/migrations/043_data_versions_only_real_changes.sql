-- 043: data_versions.v solo sube cuando los datos cambian DE VERDAD.
--
-- Con la 042 el trigger era por sentencia y saltaba con cualquier escritura,
-- aunque no cambiara nada o solo cambiara una columna que ninguna caché usa.
-- Del 18/10 al 20/10/2026 la versión subió ~440 veces al día: cada pasada del
-- sync en vivo (cada 5 min con partidos) reescribe player_scores (el trigger de
-- updated_at pone la hora aunque los puntos sean los mismos) y fixtures
-- (current_minute cambia en cada pasada). Cada subida invalida la clasificación
-- y las sanciones en vivo, y cada recálculo descarga team_players y
-- player_scores enteros (~2,7 MB): era la mayor parte del egress.
--
-- Ahora hay un trigger por evento con tablas de transición y se compara cada
-- fila antes/después quitando las columnas que se pasan como argumento
-- (las que no afectan a ningún cálculo cacheado). Una sentencia que no toca
-- filas tampoco sube la versión.
--
-- Se aplica a mano en el SQL Editor. Es reejecutable.

create or replace function public.bump_data_version_if_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    ignored text[] := coalesce(TG_ARGV::text[], '{}'::text[]);
    changed boolean;
begin
    if TG_OP = 'INSERT' then
        select exists (select 1 from new_rows) into changed;
    elsif TG_OP = 'DELETE' then
        select exists (select 1 from old_rows) into changed;
    elsif TG_OP = 'UPDATE' then
        select exists (
            select to_jsonb(n) - ignored from new_rows n
            except
            select to_jsonb(o) - ignored from old_rows o
        ) into changed;
    else
        changed := true; -- TRUNCATE
    end if;

    if changed then
        update public.data_versions set v = v + 1, changed_at = now() where id = 1;
    end if;
    return null;
end;
$$;

do $$
declare
    t text;
    -- Columnas que cambian sin que cambie nada de lo que se cachea.
    ignored text;
begin
    foreach t in array array[
        'team_players', 'player_scores', 'fixtures', 'league_config', 'penalties',
        'profiles', 'user_teams', 'players', 'real_teams', 'matchday_payments'
    ] loop
        ignored := case t
            when 'player_scores' then '''updated_at'''
            when 'fixtures' then '''current_minute'', ''home_score'', ''away_score'', ''updated_at'''
            else '''updated_at'''
        end;

        execute format('drop trigger if exists bump_data_version on public.%I', t);
        execute format('drop trigger if exists bump_data_version_ins on public.%I', t);
        execute format('drop trigger if exists bump_data_version_upd on public.%I', t);
        execute format('drop trigger if exists bump_data_version_del on public.%I', t);
        execute format('drop trigger if exists bump_data_version_trunc on public.%I', t);

        -- Postgres no deja tablas de transición en un trigger con varios
        -- eventos: uno por evento.
        execute format(
            'create trigger bump_data_version_ins after insert on public.%I '
            'referencing new table as new_rows '
            'for each statement execute function public.bump_data_version_if_changed(%s)',
            t, ignored
        );
        execute format(
            'create trigger bump_data_version_upd after update on public.%I '
            'referencing old table as old_rows new table as new_rows '
            'for each statement execute function public.bump_data_version_if_changed(%s)',
            t, ignored
        );
        execute format(
            'create trigger bump_data_version_del after delete on public.%I '
            'referencing old table as old_rows '
            'for each statement execute function public.bump_data_version_if_changed(%s)',
            t, ignored
        );
        execute format(
            'create trigger bump_data_version_trunc after truncate on public.%I '
            'for each statement execute function public.bump_data_version_if_changed()',
            t
        );
    end loop;
end;
$$;

-- ============================================================================
-- COMPROBACIÓN (en el SQL Editor, tras aplicar)
--
--   select v, changed_at from public.data_versions;
--   -- Un no-op no debe subirla:
--   update public.league_config set id = id where id = 1;
--   select v, changed_at from public.data_versions;   -- mismo v
