create table if not exists usuarios (
  idusuario serial primary key,
  login varchar(50) not null unique,
  password_hash varchar(255) not null,
  nombre varchar(120) not null,
  activo boolean not null default true,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null
);

create table if not exists grupo_cliente (
  idgrupo_cliente serial primary key,
  nombre varchar(120) not null unique,
  es_credito boolean not null default false,
  activo boolean not null default true,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null
);

create table if not exists clientes (
  idcliente serial primary key,
  chapa varchar(30) not null unique,
  marca_modelo varchar(150) not null,
  ruc varchar(40),
  nombre varchar(150),
  direccion varchar(200),
  telefono varchar(60),
  fk_idgrupo_cliente integer references grupo_cliente(idgrupo_cliente),
  activo boolean not null default true,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null
);

create table if not exists servicio_grupo (
  idservicio_grupo serial primary key,
  fecha_creado timestamp not null default now(),
  nombre varchar(120) not null unique,
  imagen varchar(255),
  activo boolean not null default true,
  creado_por varchar(120) not null default 'Sistema'
);

create table if not exists servicios (
  idservicio serial primary key,
  fk_idservicio_grupo integer references servicio_grupo(idservicio_grupo),
  nombre varchar(120) not null,
  precio_base numeric(12,2) not null default 0,
  activo boolean not null default true,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null
);

create table if not exists personal (
  idpersonal serial primary key,
  nombre varchar(120) not null,
  telefono varchar(60),
  activo boolean not null default true,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null
);

create table if not exists formas_pago (
  idforma_pago serial primary key,
  nombre varchar(60) not null unique,
  icono_ruta varchar(200),
  color varchar(30),
  mostrar_despues_crear boolean not null default true,
  activo boolean not null default true,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null
);

create table if not exists lavados (
  idlavado serial primary key,
  fk_idcliente integer not null references clientes(idcliente),
  fk_idpersonal integer not null references personal(idpersonal),
  condicion varchar(20) not null check (condicion in ('CONTADO', 'CREDITO')),
  fk_idforma_pago integer not null references formas_pago(idforma_pago),
  estado varchar(20) not null default 'EMITIDO' check (estado in ('EMITIDO', 'CREDITO', 'PAGADO', 'ANULADO')),
  total numeric(12,2) not null default 0,
  comision_personal numeric(12,2) not null default 0,
  saldo_lavadero numeric(12,2) not null default 0,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null,
  anulado_en timestamp,
  anulado_por varchar(120)
);

create table if not exists lavado_servicios (
  idlavado_servicios serial primary key,
  fk_idlavado integer not null references lavados(idlavado) on delete cascade,
  fk_idservicio integer not null references servicios(idservicio),
  precio numeric(12,2) not null,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null
);

create table if not exists comisiones_diarias (
  idcomisiones_diarias serial primary key,
  fecha date not null,
  fk_idpersonal integer not null references personal(idpersonal),
  total_lavados_emitidos integer not null default 0,
  total_servicios numeric(12,2) not null default 0,
  total_comision_40 numeric(12,2) not null default 0,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null,
  unique (fecha, fk_idpersonal)
);
