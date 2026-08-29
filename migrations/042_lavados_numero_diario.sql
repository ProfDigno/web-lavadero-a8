do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lavados'
      and column_name = 'numero'
  ) then
    alter table lavados add column numero integer;
  end if;
end;
$$;

with numerados as (
  select idlavado,
         row_number() over (
           partition by fecha_creado::date
           order by fecha_creado, idlavado
         )::integer as numero
  from lavados
  where numero is null
)
update lavados l
set numero = n.numero
from numerados n
where l.idlavado = n.idlavado;

create unique index if not exists lavados_fecha_numero_unique_idx
  on lavados ((fecha_creado::date), numero);

create or replace function asignar_numero_diario_lavado()
returns trigger
language plpgsql
as $$
declare
  fecha date;
begin
  if new.numero is not null then
    return new;
  end if;

  fecha := new.fecha_creado::date;
  perform pg_advisory_xact_lock(hashtext(fecha::text));

  select coalesce(max(l.numero), 0) + 1
    into new.numero
  from lavados l
  where l.fecha_creado::date = fecha;

  return new;
end;
$$;

drop trigger if exists lavados_asignar_numero_diario on lavados;

create trigger lavados_asignar_numero_diario
before insert on lavados
for each row
execute procedure asignar_numero_diario_lavado();

do $$
begin
  if not exists (select 1 from lavados where numero is null) then
    alter table lavados alter column numero set not null;
  end if;
end;
$$;
