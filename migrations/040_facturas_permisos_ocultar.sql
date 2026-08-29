insert into usuario_roll_evento (nombre, descripcion, codigo_evento, activo, creado_por)
values
  ('OCULTAR FACTURAS', 'Permite mostrar u ocultar las facturas y sus operaciones.', 'factura-ocultar', true, 'Sistema'),
  ('OCULTAR FACTURA LIBRE', 'Permite mostrar u ocultar la creación de facturas libres.', 'factura_libre-ocultar', true, 'Sistema'),
  ('OCULTAR CONFIGURACION FACTURASEND', 'Permite mostrar u ocultar la configuración electrónica de FacturaSend.', 'config_facturasend-ocultar', true, 'Sistema')
on conflict (codigo_evento) do nothing;

insert into usuario_roll_item (fk_idusuario_roll, fk_idusuario_roll_evento, activo, creado_por)
select ur.idusuario_roll, ure.idusuario_roll_evento, true, 'Sistema'
from usuario_roll ur
cross join usuario_roll_evento ure
where ur.activo = true
  and ure.codigo_evento in (
    'factura-ocultar',
    'factura_libre-ocultar',
    'config_facturasend-ocultar'
  )
on conflict (fk_idusuario_roll, fk_idusuario_roll_evento) do nothing;
