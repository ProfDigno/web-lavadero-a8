create table if not exists lavado_personal (
  idlavado_personal serial primary key,
  fk_idlavado integer not null references lavados(idlavado) on delete cascade,
  fk_idpersonal integer not null references personal(idpersonal),
  comision numeric(12,2) not null default 0,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null,
  unique (fk_idlavado, fk_idpersonal)
);

create index if not exists lavado_personal_lavado_idx on lavado_personal (fk_idlavado);
create index if not exists lavado_personal_personal_idx on lavado_personal (fk_idpersonal);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'lavados' and column_name = 'fk_idpersonal'
  ) then
    insert into lavado_personal (fk_idlavado, fk_idpersonal, comision, fecha_creado, creado_por)
    select idlavado, fk_idpersonal, comision_personal, fecha_creado, creado_por
    from lavados
    where fk_idpersonal is not null
    on conflict (fk_idlavado, fk_idpersonal) do nothing;

    alter table lavados drop constraint if exists lavados_personal_id_fkey;
    alter table lavados drop column fk_idpersonal;
  end if;
end $$;
