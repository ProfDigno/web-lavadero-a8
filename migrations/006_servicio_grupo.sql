create table if not exists servicio_grupo (
  idservicio_grupo serial primary key,
  fecha_creado timestamp not null default now(),
  nombre varchar(120) not null unique,
  imagen varchar(255),
  activo boolean not null default true,
  creado_por varchar(120) not null default 'Sistema'
);

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'servicios'
      and column_name = 'fk_idservicio_grupo'
  ) then
    alter table servicios
      add column fk_idservicio_grupo integer references servicio_grupo(idservicio_grupo);
  end if;
end $$;
