-- LIMPIAR DATOS OPERATIVOS
--
-- ADVERTENCIA: este script elimina definitivamente los registros operativos.
-- Ejecutar solamente cuando se quiera comenzar una nueva etapa de operación.
-- No modifica clientes, personal, servicios, formas de pago, tipos de gasto,
-- grupos, usuarios, roles ni la configuración del sistema.
--
-- Ejecutar con PostgreSQL dentro de una transacción, por ejemplo:
--   psql -h HOST -U USUARIO -d BASE -f LIMPIAR_DATOS_OPERATIVOS.sql

begin;

-- Se conserva un control temporal de los datos de mantenimiento para validar
-- que sus cantidades no cambien durante la limpieza.
create temporary table _limpieza_mantenimiento_antes (
  tabla text primary key,
  cantidad integer not null
) on commit drop;

insert into _limpieza_mantenimiento_antes (tabla, cantidad)
select 'clientes', count(*)::integer from clientes
union all select 'personal', count(*)::integer from personal
union all select 'servicios', count(*)::integer from servicios
union all select 'servicio_grupo', count(*)::integer from servicio_grupo
union all select 'formas_pago', count(*)::integer from formas_pago
union all select 'gasto_tipo', count(*)::integer from gasto_tipo
union all select 'grupo_cliente', count(*)::integer from grupo_cliente
union all select 'usuarios', count(*)::integer from usuarios
union all select 'usuario_roll', count(*)::integer from usuario_roll
union all select 'usuario_roll_item', count(*)::integer from usuario_roll_item
union all select 'usuario_roll_evento', count(*)::integer from usuario_roll_evento
union all select 'facturasend_config', count(*)::integer from facturasend_config;

-- Todas las tablas que se relacionan entre sí están incluidas explícitamente;
-- no se usa CASCADE para evitar afectar tablas de mantenimiento.
truncate table
  factura_items,
  facturas,
  caja_sesion_denominaciones,
  caja_sesion_formas_pago,
  caja_sesion_movimientos,
  caja_sesiones,
  lavado_personal,
  lavado_servicios,
  lavados,
  gastos,
  vales_personal,
  comisiones_diarias,
  grupo_cliente_creditos
restart identity;

-- Validación: todas las tablas operativas deben quedar vacías.
do $$
declare
  registros integer;
begin
  select sum(cantidad) into registros
  from (
    select count(*)::integer as cantidad from factura_items
    union all select count(*)::integer from facturas
    union all select count(*)::integer from caja_sesion_denominaciones
    union all select count(*)::integer from caja_sesion_formas_pago
    union all select count(*)::integer from caja_sesion_movimientos
    union all select count(*)::integer from caja_sesiones
    union all select count(*)::integer from lavado_personal
    union all select count(*)::integer from lavado_servicios
    union all select count(*)::integer from lavados
    union all select count(*)::integer from gastos
    union all select count(*)::integer from vales_personal
    union all select count(*)::integer from comisiones_diarias
    union all select count(*)::integer from grupo_cliente_creditos
  ) datos;

  if coalesce(registros, 0) <> 0 then
    raise exception 'La limpieza no dejó vacías todas las tablas operativas';
  end if;
end $$;

-- Validación: las tablas de mantenimiento deben conservar sus cantidades.
do $$
declare
  cambio record;
begin
  select antes.tabla, antes.cantidad as cantidad_antes, despues.cantidad as cantidad_despues
    into cambio
  from _limpieza_mantenimiento_antes antes
  join (
    select 'clientes' as tabla, count(*)::integer as cantidad from clientes
    union all select 'personal', count(*)::integer from personal
    union all select 'servicios', count(*)::integer from servicios
    union all select 'servicio_grupo', count(*)::integer from servicio_grupo
    union all select 'formas_pago', count(*)::integer from formas_pago
    union all select 'gasto_tipo', count(*)::integer from gasto_tipo
    union all select 'grupo_cliente', count(*)::integer from grupo_cliente
    union all select 'usuarios', count(*)::integer from usuarios
    union all select 'usuario_roll', count(*)::integer from usuario_roll
    union all select 'usuario_roll_item', count(*)::integer from usuario_roll_item
    union all select 'usuario_roll_evento', count(*)::integer from usuario_roll_evento
    union all select 'facturasend_config', count(*)::integer from facturasend_config
  ) despues on despues.tabla = antes.tabla
  where antes.cantidad <> despues.cantidad
  limit 1;

  if found then
    raise exception 'La tabla de mantenimiento % cambió de % a %', cambio.tabla, cambio.cantidad_antes, cambio.cantidad_despues;
  end if;
end $$;

commit;

-- Resultado esperado: una fila con 0 en cada tabla operativa.
select 'factura_items' as tabla, count(*)::integer as registros from factura_items
union all select 'facturas', count(*)::integer from facturas
union all select 'caja_sesion_denominaciones', count(*)::integer from caja_sesion_denominaciones
union all select 'caja_sesion_formas_pago', count(*)::integer from caja_sesion_formas_pago
union all select 'caja_sesion_movimientos', count(*)::integer from caja_sesion_movimientos
union all select 'caja_sesiones', count(*)::integer from caja_sesiones
union all select 'lavado_personal', count(*)::integer from lavado_personal
union all select 'lavado_servicios', count(*)::integer from lavado_servicios
union all select 'lavados', count(*)::integer from lavados
union all select 'gastos', count(*)::integer from gastos
union all select 'vales_personal', count(*)::integer from vales_personal
union all select 'comisiones_diarias', count(*)::integer from comisiones_diarias
union all select 'grupo_cliente_creditos', count(*)::integer from grupo_cliente_creditos
order by tabla;
