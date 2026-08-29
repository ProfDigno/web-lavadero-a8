insert into usuario_roll_evento (nombre, descripcion, codigo_evento, activo, creado_por)
values
  ('OCULTAR PAGOS', 'Permite mostrar u ocultar la configuración de formas de pago.', 'pagos-ocultar', true, 'Sistema'),
  ('OCULTAR USUARIOS', 'Permite mostrar u ocultar la administración de usuarios.', 'usuario-ocultar', true, 'Sistema'),
  ('OCULTAR EVENTOS DE USUARIO', 'Permite mostrar u ocultar la administración de eventos.', 'usuario_evento-ocultar', true, 'Sistema'),
  ('OCULTAR ROL DE USUARIO', 'Permite mostrar u ocultar la administración de rolls.', 'usuario_roll-ocultar', true, 'Sistema')
on conflict (codigo_evento) do nothing;

insert into usuario_roll_item (fk_idusuario_roll, fk_idusuario_roll_evento, activo, creado_por)
select ur.idusuario_roll, ure.idusuario_roll_evento, true, 'Sistema'
from usuario_roll ur
cross join usuario_roll_evento ure
where ur.activo = true
  and ure.codigo_evento in (
    'pagos-ocultar',
    'usuario-ocultar',
    'usuario_evento-ocultar',
    'usuario_roll-ocultar'
  )
on conflict (fk_idusuario_roll, fk_idusuario_roll_evento) do nothing;
