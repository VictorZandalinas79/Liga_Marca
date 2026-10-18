-- 042: contador de versión de los datos, para que las cachés del servidor solo
-- se recalculen cuando algo cambia de verdad.
--
-- La clasificación (/api/standings) y las sanciones en vivo (/api/penalties/live
-- y /api/notifications) descargan team_players y player_scores enteros
-- (~1,3 MB y ~450 KB por cálculo). Sus cachés caducaban por tiempo (60-180 s),
-- así que se recalculaban cada minuto aunque no hubiera cambiado nada: el
-- 17-18/10/2026 eso eran ~1.000 descargas completas de team_players al día, la
-- mayor parte del egress.
--
-- Cada sentencia que escribe en una de estas tablas sube data_versions.v; el
-- servidor mete v en la clave de caché, así que un cambio (una alineación
-- guardada, una pasada del sync en vivo) invalida al momento y, sin cambios, la
-- caché se reutiliza.
--
-- Trigger POR SENTENCIA, no por fila: el motor en vivo escribe en bloque y así
-- cuesta una actualización por pasada, no una por jugador.
--
-- user_sessions queda fuera a propósito: cambia con cada visita y dispararía la
-- versión sin parar. La clasificación lo lee (conteo de sesiones) y lo refresca
-- con un tramo de tiempo aparte (ver src/lib/data-version.ts).
--
-- Se aplica a mano en el SQL Editor. Es reejecutable. Sin ella el servidor
-- funciona igual que antes (caché de un minuto).

create table if not exists public.data_versions (
    id         integer primary key default 1 check (id = 1),
    v          bigint not null default 0,
    changed_at timestamptz not null default now()
);

insert into public.data_versions (id) values (1) on conflict (id) do nothing;

alter table public.data_versions enable row level security;

drop policy if exists data_versions_read on public.data_versions;
create policy data_versions_read on public.data_versions
    for select using (true);

create or replace function public.bump_data_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.data_versions set v = v + 1, changed_at = now() where id = 1;
    return null;
end;
$$;

do $$
declare
    t text;
begin
    foreach t in array array[
        'team_players', 'player_scores', 'fixtures', 'league_config', 'penalties',
        'profiles', 'user_teams', 'players', 'real_teams', 'matchday_payments'
    ] loop
        execute format('drop trigger if exists bump_data_version on public.%I', t);
        execute format(
            'create trigger bump_data_version after insert or update or delete or truncate '
            'on public.%I for each statement execute function public.bump_data_version()',
            t
        );
    end loop;
end;
$$;
