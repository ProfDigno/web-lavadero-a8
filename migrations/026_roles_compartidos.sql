do $migration$
begin
  if to_regclass('public.usuario_roll_legacy') is not null
     or exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'usuarios'
         and column_name = 'fk_idusuario_roll'
     ) then
    return;
  end if;

  execute $body$
    alter table usuario_roll rename to usuario_roll_legacy;
    alter table usuario_roll_item rename to usuario_roll_item_legacy;
    alter table usuario_roll_evento rename to usuario_roll_evento_legacy;

    create table usuario_roll (
      idusuario_roll serial primary key,
      roll varchar(80) not null unique,
      fecha_creado timestamp not null default now(),
      creado_por varchar(120) not null default 'Sistema'
    );

    alter table usuarios add column fk_idusuario_roll integer;

    insert into usuario_roll (roll, creado_por)
    select legacy.roll, min(legacy.creado_por)
    from usuario_roll_legacy legacy
    group by legacy.roll;

    update usuarios u
    set fk_idusuario_roll = ur.idusuario_roll
    from usuario_roll_legacy legacy
    join usuario_roll ur on ur.roll = legacy.roll
    where legacy.usuario_id = u.idusuario;

    alter table usuarios
      add constraint usuarios_usuario_roll_fk
      foreign key (fk_idusuario_roll) references usuario_roll(idusuario_roll) on delete set null;

    create table usuario_roll_item (
      idusuario_roll_item serial primary key,
      fk_idusuario_roll integer not null references usuario_roll(idusuario_roll) on delete cascade,
      codigo_item varchar(100) not null,
      nombre varchar(150) not null,
      activo boolean not null default true,
      fecha_creado timestamp not null default now(),
      creado_por varchar(120) not null default 'Sistema',
      constraint usuario_roll_item_codigo_key unique (fk_idusuario_roll, codigo_item)
    );

    insert into usuario_roll_item (fk_idusuario_roll, codigo_item, nombre, activo, creado_por)
    select ur.idusuario_roll,
           legacy.codigo_item,
           min(legacy.nombre),
           bool_and(legacy.activo),
           min(legacy.creado_por)
    from usuario_roll_item_legacy legacy
    join usuario_roll_legacy legacy_roll on legacy_roll.id = legacy.fk_idusuario_roll
    join usuario_roll ur on ur.roll = legacy_roll.roll
    group by ur.idusuario_roll, legacy.codigo_item;

    create table usuario_roll_evento (
      idusuario_roll_evento serial primary key,
      fk_idusuario_roll integer not null references usuario_roll(idusuario_roll) on delete cascade,
      nombre varchar(150) not null,
      descripcion varchar(500),
      codigo_evento varchar(120) not null,
      activo boolean not null default true,
      fecha_creado timestamp not null default now(),
      creado_por varchar(120) not null default 'Sistema',
      constraint usuario_roll_evento_codigo_key unique (fk_idusuario_roll, codigo_evento)
    );

    insert into usuario_roll_evento (fk_idusuario_roll, nombre, descripcion, codigo_evento, activo, creado_por)
    select ur.idusuario_roll,
           min(legacy.nombre),
           min(legacy.descripcion),
           legacy.codigo_evento,
           bool_and(legacy.activo),
           min(legacy.creado_por)
    from usuario_roll_evento_legacy legacy
    join usuario_roll_legacy legacy_roll on legacy_roll.id = legacy.fk_idusuario_roll
    join usuario_roll ur on ur.roll = legacy_roll.roll
    group by ur.idusuario_roll, legacy.codigo_evento;

    drop table usuario_roll_evento_legacy;
    drop table usuario_roll_item_legacy;
    drop table usuario_roll_legacy;

    create index usuario_roll_item_codigo_idx on usuario_roll_item (codigo_item);
    create index usuario_roll_evento_codigo_idx on usuario_roll_evento (codigo_evento);
  $body$;
end
$migration$;
