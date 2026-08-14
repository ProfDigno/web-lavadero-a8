create table if not exists usuario_roll (
  idusuario_roll serial primary key,
  fk_idusuario integer not null unique references usuarios(idusuario) on delete cascade,
  roll varchar(80) not null check (btrim(roll) <> ''),
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null default 'Sistema'
);

create index if not exists usuario_roll_roll_idx on usuario_roll (roll);

create table if not exists usuario_roll_item (
  idusuario_roll_item serial primary key,
  fk_idusuario_roll integer not null references usuario_roll(idusuario_roll) on delete cascade,
  codigo_item varchar(100) not null,
  nombre varchar(150) not null,
  activo boolean not null default true,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null default 'Sistema',
  unique (fk_idusuario_roll, codigo_item)
);

do $index_migration$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usuario_roll_item'
      and column_name = 'codigo_item'
  ) then
    create index if not exists usuario_roll_item_codigo_idx on usuario_roll_item (codigo_item);
  end if;
end
$index_migration$;

create table if not exists usuario_roll_evento (
  idusuario_roll_evento serial primary key,
  fk_idusuario_roll integer not null references usuario_roll(idusuario_roll) on delete cascade,
  nombre varchar(150) not null,
  descripcion varchar(500),
  codigo_evento varchar(120) not null,
  activo boolean not null default true,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null default 'Sistema',
  unique (fk_idusuario_roll, codigo_evento)
);

create index if not exists usuario_roll_evento_codigo_idx on usuario_roll_evento (codigo_evento);
