do $$
begin
  if not exists (
    select 1
    from pg_class
    where relkind = 'S'
      and relname = 'venta_numero_seq'
  ) then
    create sequence venta_numero_seq;
  end if;
end;
$$;

create table if not exists producto_categoria (
  idproducto_categoria serial primary key,
  nombre varchar(120) not null unique,
  descripcion varchar(220),
  activo boolean not null default true,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null default 'Sistema'
);

create table if not exists producto (
  idproducto serial primary key,
  fk_idproducto_categoria integer not null references producto_categoria(idproducto_categoria) on delete restrict,
  codigo varchar(60) not null unique,
  nombre varchar(150) not null,
  descripcion varchar(220),
  precio_compra integer not null default 0 check (precio_compra >= 0),
  precio_venta integer not null default 0 check (precio_venta >= 0),
  stock_actual integer not null default 0 check (stock_actual >= 0),
  stock_minimo integer not null default 0 check (stock_minimo >= 0),
  activo boolean not null default true,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null default 'Sistema'
);

create table if not exists venta (
  idventa serial primary key,
  numero varchar(60) not null unique default ('V-' || nextval('venta_numero_seq')::text),
  fecha_venta timestamp not null default now(),
  fk_idcliente integer references clientes(idcliente) on delete restrict,
  fk_idforma_pago integer not null references formas_pago(idforma_pago) on delete restrict,
  condicion varchar(20) not null default 'CONTADO'
    check (condicion in ('CONTADO', 'CREDITO')),
  estado varchar(20) not null default 'PAGADO'
    check (estado in ('PENDIENTE', 'PAGADO', 'ANULADO')),
  subtotal integer not null default 0 check (subtotal >= 0),
  total integer not null default 0 check (total >= 0),
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null default 'Sistema',
  pagado_en timestamp,
  pagado_por varchar(120),
  anulado_en timestamp,
  anulado_por varchar(120),
  constraint venta_condicion_estado_check check (
    (condicion = 'CONTADO' and estado in ('PAGADO', 'ANULADO'))
    or (condicion = 'CREDITO' and estado in ('PENDIENTE', 'PAGADO', 'ANULADO'))
  )
);

alter table venta
  alter column numero set default ('V-' || nextval('venta_numero_seq')::text);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'venta' and column_name = 'pagado_en'
  ) then
    alter table venta add column pagado_en timestamp;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'venta' and column_name = 'pagado_por'
  ) then
    alter table venta add column pagado_por varchar(120);
  end if;
end;
$$;

create table if not exists venta_item (
  idventa_item serial primary key,
  fk_idventa integer not null references venta(idventa) on delete cascade,
  fk_idproducto integer not null references producto(idproducto) on delete restrict,
  precio_venta integer not null check (precio_venta >= 0),
  precio_compra integer not null check (precio_compra >= 0),
  cantidad integer not null check (cantidad > 0),
  subtotal integer not null check (subtotal >= 0),
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null default 'Sistema',
  constraint venta_item_venta_producto_unique unique (fk_idventa, fk_idproducto)
);

create index if not exists producto_categoria_activo_idx
  on producto_categoria (activo);

create index if not exists producto_categoria_producto_idx
  on producto (fk_idproducto_categoria);

create index if not exists venta_fecha_idx
  on venta (fecha_venta);

create index if not exists venta_cliente_idx
  on venta (fk_idcliente);

create index if not exists venta_forma_pago_idx
  on venta (fk_idforma_pago);

create index if not exists venta_estado_idx
  on venta (estado);

create index if not exists venta_item_venta_idx
  on venta_item (fk_idventa);

create index if not exists venta_item_producto_idx
  on venta_item (fk_idproducto);
