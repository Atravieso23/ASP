-- ASP · Disponibilidad de jugadores
-- Migración 1: tabla y permisos para respuestas individuales.
--
-- Esta migración NO modifica ni borra public.match_data.
-- Debe ejecutarse una sola vez desde Supabase > SQL Editor.

begin;

create table public.player_responses (
  id uuid primary key default gen_random_uuid(),
  match_id bigint not null default 1,
  user_id uuid not null default auth.uid(),
  player_name text not null,
  status text not null,
  available_from time without time zone,
  available_to time without time zone,
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint player_responses_name_length
    check (char_length(btrim(player_name)) between 2 and 60),

  constraint player_responses_name_trimmed
    check (player_name = btrim(player_name)),

  constraint player_responses_status
    check (status in ('in', 'doubt', 'out')),

  constraint player_responses_availability
    check (
      (
        status = 'out'
        and available_from is null
        and available_to is null
      )
      or
      (
        status in ('in', 'doubt')
        and available_from is not null
        and available_to is not null
        and available_from >= time '09:00'
        and available_to <= time '22:00'
        and available_to > available_from
      )
    ),

  constraint player_responses_payment
    check (paid = false or status = 'in'),

  constraint player_responses_one_per_user
    unique (match_id, user_id)
);

-- No permite dos nombres iguales en el mismo partido, ignorando mayúsculas
-- y espacios exteriores. La misma persona sí puede actualizar su respuesta.
create unique index player_responses_unique_name_per_match
  on public.player_responses (match_id, lower(btrim(player_name)));

create index player_responses_match_status_idx
  on public.player_responses (match_id, status);

create or replace function public.set_player_response_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger player_responses_set_updated_at
before update on public.player_responses
for each row
execute function public.set_player_response_updated_at();

alter table public.player_responses enable row level security;

-- Se quitan permisos generales y se habilitan solo las operaciones necesarias.
revoke all on table public.player_responses from public, anon, authenticated;
grant select, insert, update on table public.player_responses to authenticated;

-- Un jugador anónimo autenticado solo puede leer su propia respuesta.
create policy "player_responses_select_own"
on public.player_responses
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Solo puede crear una respuesta a nombre de su propia identidad anónima.
create policy "player_responses_insert_own"
on public.player_responses
for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- Solo puede modificar su propia respuesta y no puede transferirla a otro usuario.
create policy "player_responses_update_own"
on public.player_responses
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

comment on table public.player_responses is
  'Disponibilidad y pago declarados por cada jugador para un partido de ASP.';

commit;

-- Diagnóstico de solo lectura. El resultado ayuda a adaptar la aplicación
-- existente sin adivinar los permisos actuales de public.match_data.
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('match_data', 'player_responses')
order by tablename, policyname;

