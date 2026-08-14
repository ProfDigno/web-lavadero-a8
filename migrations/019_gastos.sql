create table if not exists gasto_tipo (
  idgasto_tipo serial primary key,
  nombre varchar(120) not null unique,
  activo boolean not null default true,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null
);

create table if not exists gastos (
  idgasto serial primary key,
  fk_idgasto_tipo integer not null references gasto_tipo(idgasto_tipo),
  fecha_gasto date not null,
  descripcion varchar(250),
  monto numeric(12,2) not null default 0,
  fk_idforma_pago integer not null references formas_pago(idforma_pago),
  estado varchar(20) not null default 'EMITIDO' check (estado in ('EMITIDO', 'ANULADO')),
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null,
  anulado_en timestamp,
  anulado_por varchar(120)
);

create index if not exists gastos_fecha_tipo_idx
  on gastos (fecha_gasto, fk_idgasto_tipo);
