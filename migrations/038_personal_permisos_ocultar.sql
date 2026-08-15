insert into usuario_roll_evento (nombre, descripcion, codigo_evento, activo, creado_por)
values
  ('OCULTAR PERSONAL', 'Permite mostrar u ocultar la pantalla de personal.', 'personal-ocultar', true, 'Sistema'),
  ('OCULTAR ANALISIS DE PERSONAL', 'Permite mostrar u ocultar el analisis de personal.', 'analisis_personal-ocultar', true, 'Sistema'),
  ('OCULTAR VALES', 'Permite mostrar u ocultar la pantalla de vales.', 'vale-ocultar', true, 'Sistema'),
  ('OCULTAR COMISIONES', 'Permite mostrar u ocultar la pantalla de comisiones.', 'comisiones-ocultar', true, 'Sistema')
on conflict (codigo_evento) do nothing;

insert into usuario_roll_item (fk_idusuario_roll, fk_idusuario_roll_evento, activo, creado_por)
select ur.idusuario_roll, ure.idusuario_roll_evento, true, 'Sistema'
from usuario_roll ur
cross join usuario_roll_evento ure
where ur.activo = true
  and ure.codigo_evento in (
    'personal-ocultar',
    'analisis_personal-ocultar',
    'vale-ocultar',
    'comisiones-ocultar'
  )
on conflict (fk_idusuario_roll, fk_idusuario_roll_evento) do nothing;
