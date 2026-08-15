# Permisos por roll y ocultación de pantallas

## Propósito

Las pantallas que puedan mostrarse u ocultarse por rol deben usar el modelo de eventos y permisos existente:

- `usuario_roll_evento`: define el evento funcional.
- `usuario_roll_item`: asigna el evento a cada roll y guarda su estado particular.
- `usuarios.fk_idusuario_roll`: relaciona el usuario con su roll.

El estado que decide si un usuario puede ejecutar el evento es:

```text
usuario_roll_item.activo
```

`usuario_roll_evento.activo` identifica si el evento global está disponible, pero no reemplaza la configuración específica del roll. La aplicación debe usar `usuario_roll_item.activo` para resolver `canEvent()` y `requireEvent()`.

## Patrón de implementación

Para una pantalla protegida, por ejemplo Caja:

1. Crear un evento con un código estable, como `caja-ocultar`.
2. Asignarlo a los rolls mediante `usuario_roll_item`.
3. Usar `canEvent('caja-ocultar')` para mostrar u ocultar enlaces y botones.
4. Usar `requireEvent('caja-ocultar')` en la ruta para impedir el acceso directo.
5. Cuando el permiso sea falso, mostrar el enlace en estado visual oculto o gris y tachado si se necesita conservarlo visible.

El mismo patrón se aplica a `cierre_caja-ocultar` para proteger la apertura, el cierre, el detalle y los PDFs de Cierre de caja.

En el menú Cliente, los permisos individuales son:

- `cliente-ocultar`: Cliente.
- `grupo_cliente-ocultar`: Grupo de cliente.
- `credito_grupo-ocultar`: Crédito por grupo.

El menú Cliente permanece visible aunque uno de sus enlaces esté oculto. El endpoint interno `/clientes/buscar` permanece disponible para la selección de clientes en lavados.

En el menú Personal, los permisos también son individuales:

- `personal-ocultar`: pantalla CRUD de Personal.
- `analisis_personal-ocultar`: Análisis de personal.
- `vale-ocultar`: emisión, edición y anulación de Vales.
- `comisiones-ocultar`: resumen de Comisiones.

El menú Personal permanece visible aunque uno de sus enlaces esté oculto. Cada pantalla se protege con su propio evento.

Ejemplo de ruta:

```js
app.get('/caja', requireAuth, requireEvent('caja-ocultar'), handler);
```

Ejemplo de vista:

```ejs
<% if (canEvent('caja-ocultar')) { %>
  <a href="/caja">Caja</a>
<% } else { %>
  <a class="nav-link-disabled" href="/caja" aria-disabled="true">
    Caja
  </a>
<% } %>
```

La protección de la ruta es obligatoria aunque el enlace esté oculto o tachado.

## Activar o desactivar por roll

Para ocultar una pantalla para un roll específico:

```sql
update usuario_roll_item uri
set activo = false
from usuario_roll_evento ure
where uri.fk_idusuario_roll_evento = ure.idusuario_roll_evento
  and ure.codigo_evento = 'caja-ocultar'
  and uri.fk_idusuario_roll = (
    select idusuario_roll
    from usuario_roll
    where roll = 'CAJERO'
  );
```

Para volver a habilitarla:

```sql
update usuario_roll_item uri
set activo = true
from usuario_roll_evento ure
where uri.fk_idusuario_roll_evento = ure.idusuario_roll_evento
  and ure.codigo_evento = 'caja-ocultar'
  and uri.fk_idusuario_roll = (
    select idusuario_roll
    from usuario_roll
    where roll = 'CAJERO'
  );
```

El mismo patrón se aplica a cualquiera de los permisos del menú Personal. Por ejemplo, para ocultar los Vales a un roll específico:

```sql
update usuario_roll_item uri
set activo = false
from usuario_roll_evento ure
where uri.fk_idusuario_roll_evento = ure.idusuario_roll_evento
  and ure.codigo_evento = 'vale-ocultar'
  and uri.fk_idusuario_roll = (
    select idusuario_roll
    from usuario_roll
    where roll = 'CAJERO'
  );
```

Los códigos disponibles son `personal-ocultar`, `analisis_personal-ocultar`, `vale-ocultar` y `comisiones-ocultar`. Para activar nuevamente un permiso, se reemplaza `activo = false` por `activo = true`.

También se puede modificar desde la pantalla de administración de rolls y eventos.

## Migraciones futuras

Las migraciones que creen nuevos eventos deben ser idempotentes:

```sql
insert into usuario_roll_evento (nombre, descripcion, codigo_evento, activo, creado_por)
values ('OCULTAR EJEMPLO', 'Control de acceso de ejemplo.', 'ejemplo-ocultar', true, 'Sistema')
on conflict (codigo_evento) do nothing;
```

Las relaciones con los rolls deben crearse solo si no existen y no deben sobrescribir `usuario_roll_item.activo`:

```sql
insert into usuario_roll_item (fk_idusuario_roll, fk_idusuario_roll_evento, activo, creado_por)
select ur.idusuario_roll, ure.idusuario_roll_evento, true, 'Sistema'
from usuario_roll ur
cross join usuario_roll_evento ure
where ur.activo = true
  and ure.codigo_evento = 'ejemplo-ocultar'
on conflict (fk_idusuario_roll, fk_idusuario_roll_evento) do nothing;
```

De esta forma, ejecutar nuevamente las migraciones no reactiva permisos que un administrador haya deshabilitado manualmente.

## Verificación

Para revisar el estado de un evento por roll:

```sql
select ur.roll,
       ure.codigo_evento,
       uri.activo as permiso_activo,
       ure.activo as evento_activo
from usuario_roll_item uri
join usuario_roll ur on ur.idusuario_roll = uri.fk_idusuario_roll
join usuario_roll_evento ure on ure.idusuario_roll_evento = uri.fk_idusuario_roll_evento
where ure.codigo_evento = 'caja-ocultar'
order by ur.roll;
```

Debe comprobarse que:

- `permiso_activo` controle el acceso del roll.
- El enlace respete el estado del permiso.
- La ruta protegida responda con acceso bloqueado cuando el permiso sea falso.
- Las migraciones repetidas no modifiquen permisos existentes.
