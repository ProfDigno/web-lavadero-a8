create table if not exists facturas (
  idfactura serial primary key,
  numero varchar(60),
  fecha_emision date not null default current_date,
  fk_idcliente integer references clientes(idcliente),
  fk_idlavado integer references lavados(idlavado),
  cliente_nombre varchar(180) not null,
  cliente_ruc varchar(60),
  cliente_direccion varchar(220),
  condicion varchar(20) not null default 'CONTADO' check (condicion in ('CONTADO')),
  subtotal numeric(12,2) not null default 0,
  iva_10 numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  origen varchar(20) not null check (origen in ('LAVADO', 'LIBRE')),
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null
);

create table if not exists factura_items (
  idfactura_items serial primary key,
  fk_idfactura integer not null references facturas(idfactura) on delete cascade,
  fk_idservicio integer references servicios(idservicio),
  descripcion varchar(220) not null,
  cantidad numeric(12,2) not null default 1,
  precio_unitario numeric(12,2) not null default 0,
  exenta numeric(12,2) not null default 0,
  iva_5 numeric(12,2) not null default 0,
  iva_10 numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null
);

create index if not exists facturas_fecha_idx on facturas (fecha_emision);
create index if not exists facturas_lavado_idx on facturas (fk_idlavado);
create index if not exists factura_items_factura_idx on factura_items (fk_idfactura);
