insert into usuario_roll_evento (nombre, descripcion, codigo_evento, activo, creado_por)
values
  ('OCULTAR CATEGORIAS DE PRODUCTOS', 'Permite mostrar u ocultar la administración de categorías de productos.', 'producto_categoria-ocultar', true, 'Sistema'),
  ('OCULTAR PRODUCTOS', 'Permite mostrar u ocultar la administración de productos.', 'producto-ocultar', true, 'Sistema'),
  ('OCULTAR VENTAS', 'Permite mostrar u ocultar el registro y consulta de ventas.', 'venta-ocultar', true, 'Sistema')
on conflict (codigo_evento) do nothing;

insert into usuario_roll_item (fk_idusuario_roll, fk_idusuario_roll_evento, activo, creado_por)
select ur.idusuario_roll, ure.idusuario_roll_evento, true, 'Sistema'
from usuario_roll ur
cross join usuario_roll_evento ure
where ur.activo = true
  and ure.codigo_evento in ('producto_categoria-ocultar', 'producto-ocultar', 'venta-ocultar')
on conflict (fk_idusuario_roll, fk_idusuario_roll_evento) do nothing;
