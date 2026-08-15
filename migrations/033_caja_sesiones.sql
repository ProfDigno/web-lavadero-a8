do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'gastos'
      and column_name = 'ocurrido_en'
  ) then
    alter table gastos add column ocurrido_en timestamp;
    update gastos set ocurrido_en = fecha_creado where ocurrido_en is null;
    alter table gastos alter column ocurrido_en set default now();
    alter table gastos alter column ocurrido_en set not null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vales_personal'
      and column_name = 'ocurrido_en'
  ) then
    alter table vales_personal add column ocurrido_en timestamp;
    update vales_personal set ocurrido_en = fecha_creado where ocurrido_en is null;
    alter table vales_personal alter column ocurrido_en set default now();
    alter table vales_personal alter column ocurrido_en set not null;
  end if;
end
$$;

create index if not exists gastos_ocurrido_en_idx on gastos (ocurrido_en);
create index if not exists vales_personal_ocurrido_en_idx on vales_personal (ocurrido_en);

create table if not exists caja_sesiones (
  idcaja_sesion serial primary key,
  estado varchar(20) not null default 'ABIERTA'
    constraint caja_sesiones_estado_check check (estado in ('ABIERTA', 'CERRADA')),
  abierta_en timestamp not null default now(),
  cerrada_en timestamp,
  abierta_por integer not null references usuarios(idusuario) on delete restrict,
  cerrada_por integer references usuarios(idusuario) on delete restrict,
  saldo_inicial_efectivo numeric(12,2) not null default 0
    constraint caja_sesiones_saldo_inicial_check check (saldo_inicial_efectivo >= 0),
  total_ingresos numeric(12,2) not null default 0,
  total_egresos numeric(12,2) not null default 0,
  total_neto numeric(12,2) not null default 0,
  efectivo_esperado numeric(12,2) not null default 0,
  efectivo_contado numeric(12,2),
  diferencia numeric(12,2),
  observaciones text,
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null,
  constraint caja_sesiones_cierre_check check (
    estado = 'ABIERTA'
    or (
      cerrada_en is not null
      and cerrada_por is not null
      and efectivo_contado is not null
      and diferencia is not null
    )
  ),
  constraint caja_sesiones_fechas_check check (cerrada_en is null or cerrada_en >= abierta_en)
);

create unique index if not exists caja_sesiones_una_abierta_idx
  on caja_sesiones (estado)
  where estado = 'ABIERTA';

create index if not exists caja_sesiones_abierta_en_idx
  on caja_sesiones (abierta_en desc);

create table if not exists caja_sesion_formas_pago (
  idcaja_sesion_forma_pago serial primary key,
  fk_idcaja_sesion integer not null references caja_sesiones(idcaja_sesion) on delete cascade,
  fk_idforma_pago integer not null references formas_pago(idforma_pago) on delete restrict,
  forma_pago_nombre varchar(60) not null,
  forma_pago_icono varchar(200),
  forma_pago_color varchar(30),
  ingresos numeric(12,2) not null default 0,
  egresos numeric(12,2) not null default 0,
  neto numeric(12,2) not null default 0,
  constraint caja_sesion_formas_pago_montos_check check (ingresos >= 0 and egresos >= 0),
  constraint caja_sesion_formas_pago_unique unique (fk_idcaja_sesion, fk_idforma_pago)
);

create index if not exists caja_sesion_formas_pago_sesion_idx
  on caja_sesion_formas_pago (fk_idcaja_sesion);

create table if not exists caja_sesion_movimientos (
  idcaja_sesion_movimiento serial primary key,
  fk_idcaja_sesion integer not null references caja_sesiones(idcaja_sesion) on delete cascade,
  tipo varchar(20) not null
    constraint caja_sesion_movimientos_tipo_check check (tipo in ('INGRESO', 'EGRESO')),
  origen varchar(20) not null
    constraint caja_sesion_movimientos_origen_check check (origen in ('LAVADO', 'CREDITO', 'GASTO', 'VALE')),
  fk_idlavado integer references lavados(idlavado) on delete restrict,
  fk_idgrupo_cliente_creditos integer references grupo_cliente_creditos(idgrupo_cliente_creditos) on delete restrict,
  fk_idgasto integer references gastos(idgasto) on delete restrict,
  fk_idvales_personal integer references vales_personal(idvales_personal) on delete restrict,
  fk_idforma_pago integer not null references formas_pago(idforma_pago) on delete restrict,
  monto numeric(12,2) not null constraint caja_sesion_movimientos_monto_check check (monto > 0),
  ocurrido_en timestamp not null,
  forma_pago_nombre varchar(60) not null,
  forma_pago_icono varchar(200),
  forma_pago_color varchar(30),
  referencia varchar(120),
  descripcion varchar(250),
  constraint caja_sesion_movimientos_un_origen_check check (
    (case when fk_idlavado is not null then 1 else 0 end
     + case when fk_idgrupo_cliente_creditos is not null then 1 else 0 end
     + case when fk_idgasto is not null then 1 else 0 end
     + case when fk_idvales_personal is not null then 1 else 0 end) = 1
  ),
  constraint caja_sesion_movimientos_origen_tipo_check check (
    (origen = 'LAVADO' and tipo = 'INGRESO' and fk_idlavado is not null
      and fk_idgrupo_cliente_creditos is null and fk_idgasto is null and fk_idvales_personal is null)
    or (origen = 'CREDITO' and tipo = 'INGRESO' and fk_idgrupo_cliente_creditos is not null
      and fk_idlavado is null and fk_idgasto is null and fk_idvales_personal is null)
    or (origen = 'GASTO' and tipo = 'EGRESO' and fk_idgasto is not null
      and fk_idlavado is null and fk_idgrupo_cliente_creditos is null and fk_idvales_personal is null)
    or (origen = 'VALE' and tipo = 'EGRESO' and fk_idvales_personal is not null
      and fk_idlavado is null and fk_idgrupo_cliente_creditos is null and fk_idgasto is null)
  )
);

create index if not exists caja_sesion_movimientos_sesion_idx
  on caja_sesion_movimientos (fk_idcaja_sesion, ocurrido_en);

create unique index if not exists caja_sesion_movimientos_lavado_unique_idx
  on caja_sesion_movimientos (fk_idlavado)
  where fk_idlavado is not null;

create unique index if not exists caja_sesion_movimientos_credito_unique_idx
  on caja_sesion_movimientos (fk_idgrupo_cliente_creditos)
  where fk_idgrupo_cliente_creditos is not null;

create unique index if not exists caja_sesion_movimientos_gasto_unique_idx
  on caja_sesion_movimientos (fk_idgasto)
  where fk_idgasto is not null;

create unique index if not exists caja_sesion_movimientos_vale_unique_idx
  on caja_sesion_movimientos (fk_idvales_personal)
  where fk_idvales_personal is not null;

create table if not exists caja_sesion_denominaciones (
  idcaja_sesion_denominacion serial primary key,
  fk_idcaja_sesion integer not null references caja_sesiones(idcaja_sesion) on delete cascade,
  tipo varchar(20) not null
    constraint caja_sesion_denominaciones_tipo_check check (tipo in ('BILLETE', 'MONEDA')),
  valor numeric(12,2) not null
    constraint caja_sesion_denominaciones_valor_check check (valor > 0),
  cantidad integer not null
    constraint caja_sesion_denominaciones_cantidad_check check (cantidad >= 0),
  constraint caja_sesion_denominaciones_unique unique (fk_idcaja_sesion, tipo, valor)
);

create index if not exists caja_sesion_denominaciones_sesion_idx
  on caja_sesion_denominaciones (fk_idcaja_sesion);
