# Permisos por roll y ocultación de pantallas

## Propósito

Las pantallas que puedan mostrarse u ocultarse por rol deben usar el modelo de eventos y permisos existente:

- `usuario_roll_evento`: define el evento funcional.
- `usuario_roll_item`: asigna el evento a cada roll y guarda su estado particular.
- `usuarios.fk_idusuario_roll`: relaciona el usuario con su roll.

El estado específico del roll que decide si un usuario puede ejecutar y ver el evento es:

```text
usuario_roll_item.activo
```

`usuario_roll_evento.activo` identifica si el evento global está disponible. `usuario_roll_item.activo` guarda la configuración específica de cada roll y es el estado que se debe respetar al construir el menú y validar el acceso. La aplicación usa `canEvent()` para la interfaz y `requireEvent()` para las rutas protegidas.

## Patrón de implementación

Para una pantalla protegida, por ejemplo Caja:

1. Crear un evento con un código estable, como `caja-ocultar`.
2. Asignarlo a los rolls mediante `usuario_roll_item`.
3. Usar `canEvent('caja-ocultar')` para mostrar u ocultar enlaces y botones.
4. Usar `requireEvent('caja-ocultar')` en la ruta para impedir el acceso directo.
5. Cuando el permiso sea falso, no renderizar el enlace en el menú.

Si todas las opciones de un submenú están deshabilitadas, tampoco se debe renderizar el título del menú padre. Esto evita mostrar menús vacíos y mantiene la navegación limpia.

El mismo patrón se aplica a `cierre_caja-ocultar` para proteger la apertura, el cierre, el detalle y los PDFs de Cierre de caja.

Los eventos de ocultación disponibles actualmente son:

- `AnalisisLavado-ocultar`: Análisis general de lavados.
- `caja-ocultar`: Caja.
- `cierre_caja-ocultar`: Cierre de caja.
- `cliente-ocultar`: Cliente.
- `grupo_cliente-ocultar`: Grupo de cliente.
- `credito_grupo-ocultar`: Crédito por grupo.
- `servicio-ocultar`: Servicios y grupos de servicios.
- `personal-ocultar`: Personal.
- `analisis_personal-ocultar`: Análisis de personal.
- `vale-ocultar`: Vales.
- `comisiones-ocultar`: Comisiones.
- `gasto-ocultar`: Gastos.
- `gasto_tipo-ocultar`: Administración de tipos de gasto.
- `pagos-ocultar`: Configuración de formas de pago.
- `usuario-ocultar`: Administración de usuarios.
- `usuario_roll-ocultar`: Administración de rolls.
- `usuario_evento-ocultar`: Administración de eventos.
- `factura-ocultar`: Facturas y operaciones sobre facturas existentes.
- `factura_libre-ocultar`: Nueva factura libre.
- `config_facturasend-ocultar`: Configuración electrónica de FacturaSend.

En el menú Cliente, los permisos individuales son:

- `cliente-ocultar`: Cliente.
- `grupo_cliente-ocultar`: Grupo de cliente.
- `credito_grupo-ocultar`: Crédito por grupo.

Cada enlace se renderiza solo si su permiso está activo. El menú Cliente desaparece si los tres permisos están inactivos. El endpoint interno `/clientes/buscar` permanece disponible para la selección de clientes en lavados.

En el menú Personal, los permisos también son individuales:

- `personal-ocultar`: pantalla CRUD de Personal.
- `analisis_personal-ocultar`: Análisis de personal.
- `vale-ocultar`: emisión, edición y anulación de Vales.
- `comisiones-ocultar`: resumen de Comisiones.

Cada enlace se renderiza solo si su permiso está activo. El menú Personal desaparece si sus cuatro permisos están inactivos. Cada pantalla se protege con su propio evento.

El menú Servicio se muestra únicamente cuando `servicio-ocultar` está activo y contiene las opciones Servicios y Grupos de servicios. En el menú Gasto, `gasto_tipo-ocultar` controla `Gasto tipo` y `gasto-ocultar` controla `Gasto`; el menú desaparece si ambos permisos están deshabilitados.

El menú de configuración contiene:

- `pagos-ocultar`: `Configuración > Pagos`, con la ruta `/formas-pago`.

El menú Usuarios contiene tres permisos independientes:

- `usuario-ocultar`: `Usuarios > Usuario`, rutas `/usuarios`.
- `usuario_roll-ocultar`: `Usuarios > Roll`, rutas `/usuario-roll` y cambios de ítems.
- `usuario_evento-ocultar`: `Usuarios > Evento`, rutas `/usuario-roll-eventos`.

El menú Usuarios desaparece cuando sus tres opciones están deshabilitadas.

El menú Factura contiene tres opciones independientes:

- `factura-ocultar`: muestra `Facturas` y protege `/facturas`, la consulta de RUC, la edición, el PDF y las operaciones electrónicas de facturas existentes. También controla la facturación iniciada desde un lavado mediante `/facturas/nueva?fk_idlavado=...`.
- `factura_libre-ocultar`: muestra `Nueva factura libre` y protege `/facturas/nueva` sin `fk_idlavado`, además de la creación enviada sin lavado.
- `config_facturasend-ocultar`: muestra `Configuracion electronica` y protege `/facturasend/config`, la importación y la prueba de conexión.

El menú Factura desaparece cuando sus tres permisos están deshabilitados. La ruta compartida `POST /facturas` selecciona el permiso según la solicitud: si contiene `fk_idlavado`, usa `factura-ocultar`; de lo contrario, usa `factura_libre-ocultar`.

Ejemplo de ruta:

```js
app.get('/caja', requireAuth, requireEvent('caja-ocultar'), handler);
```

Ejemplo de vista:

```ejs
<% if (canEvent('caja-ocultar')) { %>
  <a href="/caja">Caja</a>
<% } %>
```

La protección de la ruta es obligatoria aunque el enlace no se renderice en el menú.

La opción `Gasto tipo` y todas las operaciones de `/gasto-tipos` requieren `gasto_tipo-ocultar`.

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

Los nuevos permisos de Configuración y Usuarios se administran con los mismos códigos:
`pagos-ocultar`, `usuario-ocultar`, `usuario_roll-ocultar` y `usuario_evento-ocultar`.

Los permisos de Facturación se administran con `factura-ocultar`, `factura_libre-ocultar` y `config_facturasend-ocultar`. Por ejemplo, para deshabilitar las tres opciones a un roll:

```sql
update usuario_roll_item uri
set activo = false
from usuario_roll_evento ure
where uri.fk_idusuario_roll_evento = ure.idusuario_roll_evento
  and ure.codigo_evento = any(array[
    'factura-ocultar',
    'factura_libre-ocultar',
    'config_facturasend-ocultar'
  ])
  and uri.fk_idusuario_roll = (
    select idusuario_roll
    from usuario_roll
    where roll = 'CAJERO'
  );
```

Para volver a habilitarlos, reemplazar `activo = false` por `activo = true`. También se puede actualizar un solo código cambiando la lista `any(array[...])` por `ure.codigo_evento = 'factura-ocultar'`, `ure.codigo_evento = 'factura_libre-ocultar'` o `ure.codigo_evento = 'config_facturasend-ocultar'`.

Para deshabilitar los cuatro permisos para un roll específico:

```sql
update usuario_roll_item uri
set activo = false
from usuario_roll_evento ure
where uri.fk_idusuario_roll_evento = ure.idusuario_roll_evento
  and ure.codigo_evento = any(array[
    'pagos-ocultar',
    'usuario-ocultar',
    'usuario_roll-ocultar',
    'usuario_evento-ocultar'
  ])
  and uri.fk_idusuario_roll = (
    select idusuario_roll
    from usuario_roll
    where roll = 'CAJERO'
  );
```

Para habilitarlos nuevamente, reemplazar `activo = false` por `activo = true`.

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
- El enlace no se renderice cuando el permiso sea falso.
- El menú padre desaparezca cuando no tenga subopciones visibles.
- La ruta protegida responda con acceso bloqueado cuando el permiso sea falso.
- Las migraciones repetidas no modifiquen permisos existentes.
