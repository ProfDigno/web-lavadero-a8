insert into usuario_roll_evento (nombre, descripcion, codigo_evento, activo, creado_por)
values (
  'OCULTAR TIPOS DE GASTO',
  'Permite mostrar u ocultar la administración de tipos de gasto.',
  'gasto_tipo-ocultar',
  true,
  'Sistema'
)
on conflict (codigo_evento) do nothing;

insert into usuario_roll_item (fk_idusuario_roll, fk_idusuario_roll_evento, activo, creado_por)
select ur.idusuario_roll, ure.idusuario_roll_evento, true, 'Sistema'
from usuario_roll ur
cross join usuario_roll_evento ure
where ur.activo = true
  and ure.codigo_evento = 'gasto_tipo-ocultar'
on conflict (fk_idusuario_roll, fk_idusuario_roll_evento) do nothing;
