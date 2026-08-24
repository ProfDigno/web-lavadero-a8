insert into usuario_roll_evento (nombre, descripcion, codigo_evento, activo, creado_por)
values (
  'OCULTAR ANALISIS DE CLIENTE',
  'Permite mostrar u ocultar el análisis de cliente.',
  'AnalisisCliente-ocultar',
  true,
  'Sistema'
)
on conflict (codigo_evento) do nothing;

insert into usuario_roll_item (fk_idusuario_roll, fk_idusuario_roll_evento, activo, creado_por)
select ur.idusuario_roll, ure.idusuario_roll_evento, true, 'Sistema'
from usuario_roll ur
cross join usuario_roll_evento ure
where ur.activo = true
  and ure.codigo_evento = 'AnalisisCliente-ocultar'
on conflict (fk_idusuario_roll, fk_idusuario_roll_evento) do nothing;
