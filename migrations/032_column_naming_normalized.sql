do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('clientes', 'id', 'idcliente'),
      ('clientes', 'grupo_cliente_id', 'fk_idgrupo_cliente'),
      ('clientes', 'creado_en', 'fecha_creado'),
      ('comisiones_diarias', 'id', 'idcomisiones_diarias'),
      ('comisiones_diarias', 'personal_id', 'fk_idpersonal'),
      ('comisiones_diarias', 'creado_en', 'fecha_creado'),
      ('factura_items', 'id', 'idfactura_items'),
      ('factura_items', 'factura_id', 'fk_idfactura'),
      ('factura_items', 'servicio_id', 'fk_idservicio'),
      ('factura_items', 'creado_en', 'fecha_creado'),
      ('facturas', 'id', 'idfactura'),
      ('facturas', 'cliente_id', 'fk_idcliente'),
      ('facturas', 'lavado_id', 'fk_idlavado'),
      ('facturas', 'creado_en', 'fecha_creado'),
      ('facturasend_config', 'id', 'idfacturasend_config'),
      ('facturasend_config', 'creado_en', 'fecha_creado'),
      ('formas_pago', 'id', 'idforma_pago'),
      ('formas_pago', 'creado_en', 'fecha_creado'),
      ('gasto_tipo', 'id', 'idgasto_tipo'),
      ('gasto_tipo', 'creado_en', 'fecha_creado'),
      ('gastos', 'id', 'idgasto'),
      ('gastos', 'gasto_tipo_id', 'fk_idgasto_tipo'),
      ('gastos', 'forma_pago_id', 'fk_idforma_pago'),
      ('gastos', 'creado_en', 'fecha_creado'),
      ('grupo_cliente', 'id', 'idgrupo_cliente'),
      ('grupo_cliente', 'creado_en', 'fecha_creado'),
      ('grupo_cliente_creditos', 'id', 'idgrupo_cliente_creditos'),
      ('grupo_cliente_creditos', 'grupo_cliente_id', 'fk_idgrupo_cliente'),
      ('grupo_cliente_creditos', 'forma_pago_id', 'fk_idforma_pago'),
      ('grupo_cliente_creditos', 'pagado_por_usuario_id', 'fk_idusuario'),
      ('grupo_cliente_creditos', 'creado_en', 'fecha_creado'),
      ('lavado_personal', 'id', 'idlavado_personal'),
      ('lavado_personal', 'lavado_id', 'fk_idlavado'),
      ('lavado_personal', 'personal_id', 'fk_idpersonal'),
      ('lavado_personal', 'creado_en', 'fecha_creado'),
      ('lavado_servicios', 'id', 'idlavado_servicios'),
      ('lavado_servicios', 'lavado_id', 'fk_idlavado'),
      ('lavado_servicios', 'servicio_id', 'fk_idservicio'),
      ('lavado_servicios', 'creado_en', 'fecha_creado'),
      ('lavados', 'id', 'idlavado'),
      ('lavados', 'cliente_id', 'fk_idcliente'),
      ('lavados', 'forma_pago_id', 'fk_idforma_pago'),
      ('lavados', 'grupo_cliente_credito_id', 'fk_idgrupo_cliente_creditos'),
      ('lavados', 'creado_en', 'fecha_creado'),
      ('personal', 'id', 'idpersonal'),
      ('personal', 'creado_en', 'fecha_creado'),
      ('servicio_grupo', 'id', 'idservicio_grupo'),
      ('servicio_grupo', 'creado_en', 'fecha_creado'),
      ('servicios', 'id', 'idservicio'),
      ('servicios', 'servicio_grupo_id', 'fk_idservicio_grupo'),
      ('servicios', 'creado_en', 'fecha_creado'),
      ('usuario_roll', 'id', 'idusuario_roll'),
      ('usuario_roll', 'creado_en', 'fecha_creado'),
      ('usuario_roll_evento', 'id', 'idusuario_roll_evento'),
      ('usuario_roll_evento', 'creado_en', 'fecha_creado'),
      ('usuario_roll_item', 'id', 'idusuario_roll_item'),
      ('usuario_roll_item', 'usuario_roll_id', 'fk_idusuario_roll'),
      ('usuario_roll_item', 'usuario_roll_evento_id', 'fk_idusuario_roll_evento'),
      ('usuario_roll_item', 'creado_en', 'fecha_creado'),
      ('usuarios', 'id', 'idusuario'),
      ('usuario_roll', 'usuario_id', 'fk_idusuario'),
      ('usuarios', 'usuario_roll_id', 'fk_idusuario_roll'),
      ('usuarios', 'creado_en', 'fecha_creado'),
      ('vales_personal', 'id', 'idvales_personal'),
      ('vales_personal', 'personal_id', 'fk_idpersonal'),
      ('vales_personal', 'forma_pago_id', 'fk_idforma_pago'),
      ('vales_personal', 'creado_en', 'fecha_creado')
    ) as mapping(table_name, old_name, new_name)
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = item.table_name
        and column_name = item.old_name
    ) and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = item.table_name
        and column_name = item.new_name
    ) then
      execute format('alter table public.%I rename column %I to %I', item.table_name, item.old_name, item.new_name);
    end if;
  end loop;
end $$;
