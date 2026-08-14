do $migration$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usuario_roll'
      and column_name = 'usuario_id'
  ) then
    alter table usuario_roll rename to usuario_roll_legacy;
    alter table usuario_roll_item rename to usuario_roll_item_legacy;

    create table usuario_roll (
      idusuario_roll serial primary key,
      roll varchar(80) not null unique,
      activo boolean not null default true,
      fecha_creado timestamp not null default now(),
      creado_por varchar(120) not null default 'Sistema'
    );

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'usuarios' and column_name = 'fk_idusuario_roll'
    ) then
      alter table usuarios add column fk_idusuario_roll integer;
    end if;

    insert into usuario_roll (roll, creado_por)
    select roll, min(creado_por)
    from usuario_roll_legacy
    group by roll;

    update usuarios u
    set fk_idusuario_roll = ur.idusuario_roll
    from usuario_roll_legacy legacy
    join usuario_roll ur on ur.roll = legacy.roll
    where legacy.usuario_id = u.idusuario;

    if not exists (
      select 1 from pg_constraint where conname = 'usuarios_usuario_roll_fk'
    ) then
      alter table usuarios
        add constraint usuarios_usuario_roll_fk
        foreign key (fk_idusuario_roll) references usuario_roll(idusuario_roll) on delete set null;
    end if;

    create table usuario_roll_item (
      idusuario_roll_item serial primary key,
      fk_idusuario_roll integer not null references usuario_roll(idusuario_roll) on delete cascade,
      fk_idusuario_roll_evento integer not null references usuario_roll_evento(idusuario_roll_evento) on delete set null,
      activo boolean not null default true,
      fecha_creado timestamp not null default now(),
      creado_por varchar(120) not null default 'Sistema',
      unique (fk_idusuario_roll, fk_idusuario_roll_evento)
    );

    insert into usuario_roll_item (fk_idusuario_roll, fk_idusuario_roll_evento, activo, creado_por)
    select ur.idusuario_roll, legacy.fk_idusuario_roll_evento, legacy.activo, legacy.creado_por
    from usuario_roll_item_legacy legacy
    join usuario_roll_legacy legacy_roll on legacy_roll.idusuario_roll = legacy.fk_idusuario_roll
    join usuario_roll ur on ur.roll = legacy_roll.roll
    where legacy.fk_idusuario_roll_evento is not null
    on conflict (fk_idusuario_roll, fk_idusuario_roll_evento) do nothing;

    drop table usuario_roll_item_legacy;
    drop table usuario_roll_legacy;
  end if;
end
$migration$;

create table if not exists usuario_roll (
  idusuario_roll serial primary key,
  roll varchar(80) not null unique,
  activo boolean not null default true,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null default 'Sistema'
);

do $migration$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'usuarios' and column_name = 'fk_idusuario_roll'
  ) then
    alter table usuarios add column fk_idusuario_roll integer;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'usuarios_usuario_roll_fk'
  ) then
    alter table usuarios
      add constraint usuarios_usuario_roll_fk
      foreign key (fk_idusuario_roll) references usuario_roll(idusuario_roll) on delete set null;
  end if;
end
$migration$;

insert into usuario_roll (roll, activo, creado_por)
values
  ('ADMINISTRADOR', true, 'Sistema'),
  ('ENCARGADO', true, 'Sistema'),
  ('CAJERO', true, 'Sistema'),
  ('LAVADOR', true, 'Sistema')
on conflict (roll) do update set activo = true;

insert into usuario_roll_evento (nombre, descripcion, codigo_evento, activo, creado_por)
values ('Bloquear servicio', 'Permite bloquear o desbloquear servicios.', 'servicio-bloqueo', true, 'Sistema')
on conflict (codigo_evento) do update set activo = true;

insert into usuario_roll_item (fk_idusuario_roll, fk_idusuario_roll_evento, activo, creado_por)
select ur.idusuario_roll, ure.idusuario_roll_evento, true, 'Sistema'
from usuario_roll ur
cross join usuario_roll_evento ure
where ure.codigo_evento = 'servicio-bloqueo'
  and ur.roll in ('ADMINISTRADOR', 'ENCARGADO', 'CAJERO')
on conflict (fk_idusuario_roll, fk_idusuario_roll_evento) do update set activo = true;

update usuarios
set fk_idusuario_roll = (select idusuario_roll from usuario_roll where roll = 'ADMINISTRADOR')
where login = 'admin'
  and fk_idusuario_roll is null;
