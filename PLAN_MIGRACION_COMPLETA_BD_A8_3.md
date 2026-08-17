# Plan de migración completa desde `bdlavadero_a8_3`

## Objetivo

Ejecutar en orden todas las migraciones de datos creadas desde la limpieza operativa:

1. Limpiar el destino.
2. Migrar lavados, servicios y personales.
3. Migrar gastos y vales.
4. Reconstruir las comisiones diarias.
5. Validar y consolidar los reportes.

El ejecutor se encuentra en `migrar-todo-bd-a8-3.js`.

## Datos incluidos

- `LIMPIAR_DATOS_OPERATIVOS.sql`
- `migrar-lavados-bd-a8-3.js`
- `migrar-gastos-vales-bd-a8-3.js`
- `recalcular-comisiones-diarias.js`

No se incluyen cambios de interfaz, edición de clientes, conversión manual a crédito ni estilos visuales.

## Requisitos previos

- PostgreSQL disponible y accesible para las bases `bdlavadero_a8_3` y `bdlavaderoA8_web`.
- Variables de conexión configuradas mediante `.env` o los valores de `src/config.js`.
- Aplicación detenida durante el proceso.
- Respaldo completo de `bdlavaderoA8_web`.
- El destino puede ser limpiado sin conservar sus datos operativos actuales.

El ejecutor intenta crear un respaldo con `pg_dump`. Si las herramientas de PostgreSQL no están instaladas, se debe realizar el respaldo manualmente y ejecutar con `--skip-backup`.

## Modos de ejecución

### Preflight

Solo consulta y valida:

```powershell
node migrar-todo-bd-a8-3.js preflight
```

Verifica conexiones, tablas, secuencias, conteos esperados del origen y conteos actuales del destino. No modifica datos.

### Ejecución completa

```powershell
node migrar-todo-bd-a8-3.js execute
```

Realiza:

1. Respaldo del destino.
2. Preflight.
3. Limpieza operativa.
4. Migración de lavados.
5. Migración de gastos y vales.
6. Recalculo de comisiones.
7. Reporte y validación final.

Si el respaldo ya fue realizado manualmente:

```powershell
node migrar-todo-bd-a8-3.js execute --skip-backup
```

Cada etapa mantiene su propia transacción. Si una etapa posterior falla, las anteriores no se revierten automáticamente; por eso el respaldo previo es obligatorio.

### Reporte final

```powershell
node migrar-todo-bd-a8-3.js report
```

Consulta el destino, lee los reportes individuales y genera:

`tmp/migracion-completa-bd-a8-3-report.json`

## Resultados esperados

### Lavados

- 4.977 lavados.
- 6.765 detalles de servicios válidos.
- 8.155 relaciones de personal.
- Siguiente `idlavado`: 4.978.
- Referencias huérfanas: 0.

Se informan, pero no se migran, los 7 productos asociados a 3 lavados y los vínculos históricos de crédito no compatibles.

### Gastos y vales

- 35 gastos.
- Total gastos: 4.377.000.
- 405 vales.
- Total vales: 33.838.278.
- Siguiente `idgasto`: 36.
- Siguiente `idvales_personal`: 406.
- Estados `TABLET` convertidos a `EMITIDO`.
- Referencias huérfanas: 0.

Se informa la trazabilidad de los vales cuyo pagador original es diferente del beneficiario.

### Comisiones

- Lavados anulados excluidos.
- Servicios distribuidos entre los personales.
- Restos centesimales asignados al primer personal.
- Comisiones tomadas desde `lavado_personal.comision`.
- Vales no anulados agrupados por fecha y beneficiario.
- Filas creadas aunque existan solo lavados o solo vales.
- Origen registrado como `RECALCULO MIGRACION`.

## Validación de mantenimiento

El reporte consolidado compara cantidades antes y después para:

- `clientes`
- `personal`
- `servicios`
- `servicio_grupo`
- `formas_pago`
- `gasto_tipo`
- `grupo_cliente`
- `usuarios`
- `usuario_roll`
- `usuario_roll_item`
- `usuario_roll_evento`
- `facturasend_config`

No se deben modificar esas cantidades durante la limpieza ni las migraciones.

## Recuperación ante error

- Detener la aplicación.
- Conservar el mensaje de la etapa fallida y los reportes generados.
- No repetir una etapa parcialmente ejecutada sin revisar el estado del destino.
- Restaurar el respaldo si se necesita volver al estado anterior.
- Ejecutar nuevamente `preflight` antes de reintentar.

