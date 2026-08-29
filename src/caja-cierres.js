const { query, withTransaction } = require("./db");

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function cajaDateRange(value) {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  const fecha = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  const siguienteFecha = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(nextDate.getDate())}`;
  return {
    desde: `${fecha} 00:00:00`,
    hasta: `${siguienteFecha} 00:00:00`
  };
}

function sourceValues(movement) {
  return [
    movement.origen === "LAVADO" ? movement.source_id : null,
    movement.origen === "CREDITO" ? movement.source_id : null,
    movement.origen === "GASTO" ? movement.source_id : null,
    movement.origen === "VALE" ? movement.source_id : null,
    movement.origen === "VENTA" ? movement.source_id : null
  ];
}

function normalizeDenominations(denominations) {
  const seen = new Set();
  return (Array.isArray(denominations) ? denominations : []).map((item) => {
    const tipo = String(item.tipo || "").trim().toUpperCase();
    const valor = money(item.valor);
    const cantidad = Number(item.cantidad);
    const key = `${tipo}:${valor}`;
    if (!["BILLETE", "MONEDA"].includes(tipo)) throw new Error("Tipo de denominacion invalido.");
    if (!(valor > 0)) throw new Error("La denominacion debe ser mayor a cero.");
    if (!Number.isInteger(cantidad) || cantidad < 0) throw new Error("La cantidad de denominaciones debe ser un entero no negativo.");
    if (seen.has(key)) throw new Error("La denominacion no puede repetirse dentro del arqueo.");
    seen.add(key);
    return { tipo, valor, cantidad };
  });
}

function summarizeCajaMovimientos(movimientos, saldoInicialEfectivo = 0) {
  const resumen = {
    ingresos: 0,
    egresos: 0,
    neto: 0,
    efectivoIngresos: 0,
    efectivoEgresos: 0,
    efectivoEsperado: money(saldoInicialEfectivo),
    formas: []
  };
  const formas = new Map();

  (movimientos || []).forEach((movement) => {
    const amount = money(movement.monto);
    const isIncome = movement.tipo === "INGRESO";
    if (isIncome) resumen.ingresos += amount;
    else resumen.egresos += amount;
    if (String(movement.forma_pago_nombre || "").trim().toUpperCase() === "EFECTIVO") {
      if (isIncome) resumen.efectivoIngresos += amount;
      else resumen.efectivoEgresos += amount;
    }

    const key = String(movement.fk_idforma_pago);
    if (!formas.has(key)) {
      formas.set(key, {
        fk_idforma_pago: movement.fk_idforma_pago,
        forma_pago_nombre: movement.forma_pago_nombre,
        forma_pago_icono: movement.forma_pago_icono,
        forma_pago_color: movement.forma_pago_color,
        ingresos: 0,
        egresos: 0,
        neto: 0
      });
    }
    const forma = formas.get(key);
    forma[isIncome ? "ingresos" : "egresos"] += amount;
    forma.neto = money(forma.ingresos - forma.egresos);
  });

  resumen.ingresos = money(resumen.ingresos);
  resumen.egresos = money(resumen.egresos);
  resumen.neto = money(resumen.ingresos - resumen.egresos);
  resumen.efectivoIngresos = money(resumen.efectivoIngresos);
  resumen.efectivoEgresos = money(resumen.efectivoEgresos);
  resumen.efectivoEsperado = money(resumen.efectivoEsperado + resumen.efectivoIngresos - resumen.efectivoEgresos);
  resumen.formas = [...formas.values()].sort((a, b) => String(a.forma_pago_nombre).localeCompare(String(b.forma_pago_nombre)));
  return resumen;
}

async function getCajaSesionAbierta(executor = { query }) {
  const result = await executor.query(
    `select cs.*, ua.nombre as abierta_por_nombre, uc.nombre as cerrada_por_nombre
     from caja_sesiones cs
     join usuarios ua on ua.idusuario = cs.abierta_por
     left join usuarios uc on uc.idusuario = cs.cerrada_por
     where cs.estado = 'ABIERTA'
     order by cs.abierta_en desc
     limit 1`
  );
  return result.rows[0] || null;
}

async function getCajaSesion(id, executor = { query }) {
  const sessionResult = await executor.query(
    `select cs.*, ua.nombre as abierta_por_nombre, uc.nombre as cerrada_por_nombre
     from caja_sesiones cs
     join usuarios ua on ua.idusuario = cs.abierta_por
     left join usuarios uc on uc.idusuario = cs.cerrada_por
     where cs.idcaja_sesion = $1`,
    [id]
  );
  const session = sessionResult.rows[0] || null;
  if (!session) return null;

  const desde = session.abierta_en;
  const hasta = session.cerrada_en || new Date();
  const [formsResult, movementsResult, denominationsResult, pendingCreditsResult] = await Promise.all([
    executor.query(
      `select *
       from caja_sesion_formas_pago
       where fk_idcaja_sesion = $1
       order by forma_pago_nombre`,
      [id]
    ),
    executor.query(
      `select *
       from caja_sesion_movimientos
       where fk_idcaja_sesion = $1
       order by ocurrido_en, idcaja_sesion_movimiento`,
      [id]
    ),
    executor.query(
      `select *
       from caja_sesion_denominaciones
       where fk_idcaja_sesion = $1
       order by tipo, valor desc`,
      [id]
    ),
    getCajaCreditosPendientes(desde, hasta, executor)
  ]);

  return {
    ...session,
    formas_pago: formsResult.rows,
    movimientos: movementsResult.rows,
    denominaciones: denominationsResult.rows,
    creditos_pendientes: pendingCreditsResult
  };
}

async function getCajaSesiones({ limit = 30, offset = 0 } = {}, executor = { query }) {
  const result = await executor.query(
    `select cs.*, ua.nombre as abierta_por_nombre, uc.nombre as cerrada_por_nombre
     from caja_sesiones cs
     join usuarios ua on ua.idusuario = cs.abierta_por
     left join usuarios uc on uc.idusuario = cs.cerrada_por
     order by cs.abierta_en desc
     limit $1 offset $2`,
    [Math.max(1, Number(limit) || 30), Math.max(0, Number(offset) || 0)]
  );
  return result.rows;
}

async function getCajaMovimientosElegibles(desde, hasta, executor = { query }) {
  const [lavados, creditos, gastos, vales, ventas, ventasRevertidas] = await Promise.all([
    executor.query(
      `select l.idlavado as source_id,
              'INGRESO' as tipo, 'LAVADO' as origen,
              l.fk_idforma_pago, l.total as monto, l.fecha_creado as ocurrido_en,
              fp.nombre as forma_pago_nombre, fp.icono_ruta as forma_pago_icono,
              fp.color as forma_pago_color,
              ('Lavado #' || l.idlavado || coalesce(' - ' || c.chapa, '')) as referencia,
              c.marca_modelo as descripcion
       from lavados l
       join clientes c on c.idcliente = l.fk_idcliente
       join formas_pago fp on fp.idforma_pago = l.fk_idforma_pago
       where l.fecha_creado >= $1
         and l.fecha_creado < $2
         and l.estado <> 'ANULADO'
         and l.condicion = 'CONTADO'
         and l.fk_idgrupo_cliente_creditos is null
         and l.total > 0
         and not exists (
           select 1 from caja_sesion_movimientos csm
           where csm.fk_idlavado = l.idlavado
         )
       order by l.fecha_creado, l.idlavado`,
      [desde, hasta]
    ),
    executor.query(
      `select gcc.idgrupo_cliente_creditos as source_id,
              'INGRESO' as tipo, 'CREDITO' as origen,
              gcc.fk_idforma_pago,
              coalesce(sum(l.total) filter (where l.estado <> 'ANULADO'), 0) as monto,
              gcc.pagado_en as ocurrido_en,
              fp.nombre as forma_pago_nombre, fp.icono_ruta as forma_pago_icono,
              fp.color as forma_pago_color,
              ('Credito #' || gcc.idgrupo_cliente_creditos) as referencia,
              g.nombre as descripcion
       from grupo_cliente_creditos gcc
       join grupo_cliente g on g.idgrupo_cliente = gcc.fk_idgrupo_cliente
       join formas_pago fp on fp.idforma_pago = gcc.fk_idforma_pago
       left join lavados l on l.fk_idgrupo_cliente_creditos = gcc.idgrupo_cliente_creditos
       where gcc.estado = 'PAGADO'
         and gcc.pagado_en >= $1
         and gcc.pagado_en < $2
         and not exists (
           select 1 from caja_sesion_movimientos csm
           where csm.fk_idgrupo_cliente_creditos = gcc.idgrupo_cliente_creditos
         )
       group by gcc.idgrupo_cliente_creditos, gcc.fk_idforma_pago, gcc.pagado_en,
                fp.nombre, fp.icono_ruta, fp.color, g.nombre
       having coalesce(sum(l.total) filter (where l.estado <> 'ANULADO'), 0) > 0
       order by gcc.pagado_en, gcc.idgrupo_cliente_creditos`,
      [desde, hasta]
    ),
    executor.query(
      `select g.idgasto as source_id,
              'EGRESO' as tipo, 'GASTO' as origen,
              g.fk_idforma_pago, g.monto, g.ocurrido_en,
              fp.nombre as forma_pago_nombre, fp.icono_ruta as forma_pago_icono,
              fp.color as forma_pago_color,
              ('Gasto #' || g.idgasto) as referencia,
              coalesce(g.descripcion, gt.nombre) as descripcion
       from gastos g
       join gasto_tipo gt on gt.idgasto_tipo = g.fk_idgasto_tipo
       join formas_pago fp on fp.idforma_pago = g.fk_idforma_pago
       where g.ocurrido_en >= $1
         and g.ocurrido_en < $2
         and g.estado <> 'ANULADO'
         and g.monto > 0
         and not exists (
           select 1 from caja_sesion_movimientos csm
           where csm.fk_idgasto = g.idgasto
         )
       order by g.ocurrido_en, g.idgasto`,
      [desde, hasta]
    ),
    executor.query(
      `select v.idvales_personal as source_id,
              'EGRESO' as tipo, 'VALE' as origen,
              v.fk_idforma_pago, v.monto, v.ocurrido_en,
              fp.nombre as forma_pago_nombre, fp.icono_ruta as forma_pago_icono,
              fp.color as forma_pago_color,
              ('Vale #' || v.idvales_personal) as referencia,
              p.nombre as descripcion
       from vales_personal v
       join personal p on p.idpersonal = v.fk_idpersonal
       join formas_pago fp on fp.idforma_pago = v.fk_idforma_pago
       where v.ocurrido_en >= $1
         and v.ocurrido_en < $2
         and v.estado <> 'ANULADO'
         and v.monto > 0
         and not exists (
           select 1 from caja_sesion_movimientos csm
           where csm.fk_idvales_personal = v.idvales_personal
         )
       order by v.ocurrido_en, v.idvales_personal`,
      [desde, hasta]
    ),
    executor.query(
      `select v.idventa as source_id,
              'INGRESO' as tipo, 'VENTA' as origen,
              v.fk_idforma_pago,
              v.total as monto,
              case when v.condicion = 'CREDITO' then v.pagado_en else v.fecha_venta end as ocurrido_en,
              fp.nombre as forma_pago_nombre, fp.icono_ruta as forma_pago_icono,
              fp.color as forma_pago_color,
              ('Venta ' || v.numero) as referencia,
              coalesce(nullif(concat_ws(' - ', nullif(trim(c.chapa), ''), nullif(trim(c.marca_modelo), '')), ''), 'Mostrador') as descripcion
       from venta v
       left join clientes c on c.idcliente = v.fk_idcliente
       join formas_pago fp on fp.idforma_pago = v.fk_idforma_pago
       where v.estado = 'PAGADO'
         and (case when v.condicion = 'CREDITO' then v.pagado_en else v.fecha_venta end) >= $1
         and (case when v.condicion = 'CREDITO' then v.pagado_en else v.fecha_venta end) < $2
         and v.total > 0
         and not exists (
           select 1 from caja_sesion_movimientos csm
           where csm.fk_idventa = v.idventa
             and csm.tipo = 'INGRESO'
         )
       order by ocurrido_en, v.idventa`,
      [desde, hasta]
    ),
    executor.query(
      `select v.idventa as source_id,
              'EGRESO' as tipo, 'VENTA' as origen,
              v.fk_idforma_pago,
              v.total as monto,
              v.anulado_en as ocurrido_en,
              fp.nombre as forma_pago_nombre, fp.icono_ruta as forma_pago_icono,
              fp.color as forma_pago_color,
              ('Reversion venta ' || v.numero) as referencia,
              coalesce(nullif(concat_ws(' - ', nullif(trim(c.chapa), ''), nullif(trim(c.marca_modelo), '')), ''), 'Mostrador') as descripcion
       from venta v
       left join clientes c on c.idcliente = v.fk_idcliente
       join formas_pago fp on fp.idforma_pago = v.fk_idforma_pago
       where v.estado = 'ANULADO'
         and v.anulado_en >= $1
         and v.anulado_en < $2
         and v.total > 0
         and exists (
           select 1 from caja_sesion_movimientos csm
           where csm.fk_idventa = v.idventa
             and csm.tipo = 'INGRESO'
         )
         and not exists (
           select 1 from caja_sesion_movimientos csm
           where csm.fk_idventa = v.idventa
             and csm.tipo = 'EGRESO'
         )
       order by v.anulado_en, v.idventa`,
      [desde, hasta]
    )
  ]);

  return [...lavados.rows, ...creditos.rows, ...gastos.rows, ...vales.rows, ...ventas.rows, ...ventasRevertidas.rows]
    .sort((a, b) => new Date(a.ocurrido_en) - new Date(b.ocurrido_en));
}

async function sincronizarCajaSesionAbierta(executor = { query }, hasta = new Date()) {
  const sessionResult = await executor.query(
    `select idcaja_sesion, abierta_en
     from caja_sesiones
     where estado = 'ABIERTA'
     order by abierta_en desc
     limit 1`
  );
  const session = sessionResult.rows[0];
  if (!session) return 0;

  const desde = session.abierta_en;
  const movimientos = await getCajaMovimientosElegibles(desde, hasta, executor);
  for (const movement of movimientos) {
    const source = sourceValues(movement);
    await executor.query(
      `insert into caja_sesion_movimientos (
         fk_idcaja_sesion, tipo, origen,
         fk_idlavado, fk_idgrupo_cliente_creditos, fk_idgasto, fk_idvales_personal, fk_idventa,
         fk_idforma_pago, monto, ocurrido_en,
         forma_pago_nombre, forma_pago_icono, forma_pago_color, referencia, descripcion
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       on conflict do nothing`,
      [
        session.idcaja_sesion, movement.tipo, movement.origen,
        source[0], source[1], source[2], source[3], source[4],
        movement.fk_idforma_pago, money(movement.monto), movement.ocurrido_en,
        movement.forma_pago_nombre, movement.forma_pago_icono, movement.forma_pago_color,
        movement.referencia, movement.descripcion
      ]
    );
  }
  return movimientos.length;
}

async function registrarVentaPagadaEnCaja(ventaId, executor = { query }) {
  const result = await executor.query(
    `select v.idventa, v.numero, v.total, v.fk_idforma_pago,
            case when v.condicion = 'CREDITO' then v.pagado_en else v.fecha_venta end as ocurrido_en,
            fp.nombre as forma_pago_nombre, fp.icono_ruta as forma_pago_icono,
            fp.color as forma_pago_color,
            coalesce(nullif(concat_ws(' - ', nullif(trim(c.chapa), ''), nullif(trim(c.marca_modelo), '')), ''), 'Mostrador') as descripcion,
            cs.idcaja_sesion
     from venta v
     left join clientes c on c.idcliente = v.fk_idcliente
     join formas_pago fp on fp.idforma_pago = v.fk_idforma_pago
     join caja_sesiones cs on cs.estado = 'ABIERTA'
       and (case when v.condicion = 'CREDITO' then v.pagado_en else v.fecha_venta end) >= cs.abierta_en
     where v.idventa = $1
       and v.estado = 'PAGADO'
       and v.total > 0
     order by cs.abierta_en desc
     limit 1`,
    [ventaId]
  );
  const venta = result.rows[0];
  if (!venta) return false;
  await executor.query(
    `insert into caja_sesion_movimientos (
       fk_idcaja_sesion, tipo, origen,
       fk_idventa, fk_idforma_pago, monto, ocurrido_en,
       forma_pago_nombre, forma_pago_icono, forma_pago_color, referencia, descripcion
     ) values ($1, 'INGRESO', 'VENTA', $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (fk_idventa, tipo) where fk_idventa is not null do nothing`,
    [venta.idcaja_sesion, venta.idventa, venta.fk_idforma_pago, money(venta.total), venta.ocurrido_en,
      venta.forma_pago_nombre, venta.forma_pago_icono, venta.forma_pago_color,
      `Venta ${venta.numero}`, venta.descripcion]
  );
  return true;
}

async function registrarReversionVentaEnCaja(ventaId, executor = { query }) {
  const result = await executor.query(
    `select v.idventa, v.numero, v.total, v.fk_idforma_pago, v.anulado_en,
            fp.nombre as forma_pago_nombre, fp.icono_ruta as forma_pago_icono,
            fp.color as forma_pago_color,
            coalesce(nullif(concat_ws(' - ', nullif(trim(c.chapa), ''), nullif(trim(c.marca_modelo), '')), ''), 'Mostrador') as descripcion,
            cs.idcaja_sesion
     from venta v
     left join clientes c on c.idcliente = v.fk_idcliente
     join formas_pago fp on fp.idforma_pago = v.fk_idforma_pago
     join caja_sesiones cs on cs.estado = 'ABIERTA'
       and v.anulado_en >= cs.abierta_en
     where v.idventa = $1
       and v.estado = 'ANULADO'
       and v.total > 0
       and exists (
         select 1 from caja_sesion_movimientos csm
         where csm.fk_idventa = v.idventa and csm.tipo = 'INGRESO'
       )
     order by cs.abierta_en desc
     limit 1`,
    [ventaId]
  );
  const venta = result.rows[0];
  if (!venta) return false;
  await executor.query(
    `insert into caja_sesion_movimientos (
       fk_idcaja_sesion, tipo, origen,
       fk_idventa, fk_idforma_pago, monto, ocurrido_en,
       forma_pago_nombre, forma_pago_icono, forma_pago_color, referencia, descripcion
     ) values ($1, 'EGRESO', 'VENTA', $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (fk_idventa, tipo) where fk_idventa is not null do nothing`,
    [venta.idcaja_sesion, venta.idventa, venta.fk_idforma_pago, money(venta.total), venta.anulado_en,
      venta.forma_pago_nombre, venta.forma_pago_icono, venta.forma_pago_color,
      `Reversion venta ${venta.numero}`, venta.descripcion]
  );
  return true;
}

async function getCajaCreditosPendientes(desde, hasta, executor = { query }) {
  const result = await executor.query(
    `select fp.idforma_pago as fk_idforma_pago,
            fp.nombre as forma_pago_nombre, fp.icono_ruta as forma_pago_icono,
            fp.color as forma_pago_color,
            count(l.idlavado)::int as cantidad,
            coalesce(sum(l.total), 0) as total
     from lavados l
     join formas_pago fp on fp.idforma_pago = l.fk_idforma_pago
     where l.fecha_creado >= $1
       and l.fecha_creado < $2
       and l.estado = 'CREDITO'
       and l.condicion = 'CREDITO'
     group by fp.idforma_pago, fp.nombre, fp.icono_ruta, fp.color
     order by fp.nombre`,
    [desde, hasta]
  );
  return result.rows;
}

async function abrirCajaSesion({ abiertaPor, saldoInicialEfectivo = 0, observaciones = null, creadoPor }) {
  if (!abiertaPor) throw new Error("Debe indicar el usuario que abre la caja.");
  const saldo = money(saldoInicialEfectivo);
  if (saldo < 0) throw new Error("El saldo inicial no puede ser negativo.");

  return withTransaction(async (client) => {
    const result = await client.query(
      `insert into caja_sesiones (abierta_por, saldo_inicial_efectivo, observaciones, creado_por)
       values ($1, $2, $3, $4)
       returning idcaja_sesion`,
      [abiertaPor, saldo, observaciones, creadoPor || String(abiertaPor)]
    );
    return getCajaSesion(result.rows[0].idcaja_sesion, client);
  });
}

async function cerrarCajaSesion({ id, cerradaPor, denominaciones = [], observaciones = null }) {
  if (!id || !cerradaPor) throw new Error("Debe indicar la sesión y el usuario que cierra la caja.");
  const normalizedDenominations = normalizeDenominations(denominaciones);

  return withTransaction(async (client) => {
    const sessionResult = await client.query(
      `select * from caja_sesiones where idcaja_sesion = $1 for update`,
      [id]
    );
    const session = sessionResult.rows[0];
    if (!session) throw new Error("Sesión de caja no encontrada.");
    if (session.estado !== "ABIERTA") throw new Error("La sesión de caja ya está cerrada.");

    const cerradaEn = new Date();
    const desde = session.abierta_en;
    const hasta = cerradaEn;
    await sincronizarCajaSesionAbierta(client, cerradaEn);
    const storedMovementsResult = await client.query(
      `select * from caja_sesion_movimientos
       where fk_idcaja_sesion = $1
       order by ocurrido_en, idcaja_sesion_movimiento`,
      [id]
    );
    const movimientosAlmacenados = storedMovementsResult.rows;
    const movimientosNuevos = await getCajaMovimientosElegibles(desde, hasta, client);
    const movimientos = [...movimientosAlmacenados, ...movimientosNuevos];
    const almacenados = new Set(movimientosAlmacenados);
    const formas = new Map();

    for (const movement of movimientos) {
      const source = sourceValues(movement);
      if (!almacenados.has(movement)) {
        await client.query(
          `insert into caja_sesion_movimientos (
             fk_idcaja_sesion, tipo, origen,
             fk_idlavado, fk_idgrupo_cliente_creditos, fk_idgasto, fk_idvales_personal, fk_idventa,
             fk_idforma_pago, monto, ocurrido_en,
             forma_pago_nombre, forma_pago_icono, forma_pago_color, referencia, descripcion
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            id, movement.tipo, movement.origen,
            source[0], source[1], source[2], source[3], source[4],
            movement.fk_idforma_pago, money(movement.monto), movement.ocurrido_en,
            movement.forma_pago_nombre, movement.forma_pago_icono, movement.forma_pago_color,
            movement.referencia, movement.descripcion
          ]
        );
      }

      const formaId = String(movement.fk_idforma_pago);
      if (!formas.has(formaId)) {
        formas.set(formaId, {
          fk_idforma_pago: movement.fk_idforma_pago,
          forma_pago_nombre: movement.forma_pago_nombre,
          forma_pago_icono: movement.forma_pago_icono,
          forma_pago_color: movement.forma_pago_color,
          ingresos: 0,
          egresos: 0
        });
      }
      const forma = formas.get(formaId);
      forma[movement.tipo === "INGRESO" ? "ingresos" : "egresos"] += money(movement.monto);
    }

    for (const forma of formas.values()) {
      forma.ingresos = money(forma.ingresos);
      forma.egresos = money(forma.egresos);
      await client.query(
        `insert into caja_sesion_formas_pago (
           fk_idcaja_sesion, fk_idforma_pago, forma_pago_nombre,
           forma_pago_icono, forma_pago_color, ingresos, egresos, neto
         ) values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (fk_idcaja_sesion, fk_idforma_pago) do update set
           forma_pago_nombre = excluded.forma_pago_nombre,
           forma_pago_icono = excluded.forma_pago_icono,
           forma_pago_color = excluded.forma_pago_color,
           ingresos = excluded.ingresos,
           egresos = excluded.egresos,
           neto = excluded.neto`,
        [id, forma.fk_idforma_pago, forma.forma_pago_nombre, forma.forma_pago_icono,
          forma.forma_pago_color, forma.ingresos, forma.egresos, money(forma.ingresos - forma.egresos)]
      );
    }

    for (const denomination of normalizedDenominations) {
      await client.query(
        `insert into caja_sesion_denominaciones (fk_idcaja_sesion, tipo, valor, cantidad)
         values ($1, $2, $3, $4)`,
        [id, denomination.tipo, denomination.valor, denomination.cantidad]
      );
    }

    const totals = movimientos.reduce((acc, movement) => {
      const amount = money(movement.monto);
      if (movement.tipo === "INGRESO") acc.ingresos += amount;
      else acc.egresos += amount;
      if (String(movement.forma_pago_nombre || "").trim().toUpperCase() === "EFECTIVO") {
        if (movement.tipo === "INGRESO") acc.efectivoIngresos += amount;
        else acc.efectivoEgresos += amount;
      }
      return acc;
    }, { ingresos: 0, egresos: 0, efectivoIngresos: 0, efectivoEgresos: 0 });

    totals.ingresos = money(totals.ingresos);
    totals.egresos = money(totals.egresos);
    totals.efectivoIngresos = money(totals.efectivoIngresos);
    totals.efectivoEgresos = money(totals.efectivoEgresos);
    const efectivoContado = money(normalizedDenominations.reduce((sum, item) => sum + item.valor * item.cantidad, 0));
    const efectivoEsperado = money(money(session.saldo_inicial_efectivo) + totals.efectivoIngresos - totals.efectivoEgresos);

    await client.query(
      `update caja_sesiones
       set estado = 'CERRADA',
           cerrada_en = $1,
           cerrada_por = $2,
           total_ingresos = $3,
           total_egresos = $4,
           total_neto = $5,
           efectivo_esperado = $6,
           efectivo_contado = $7,
           diferencia = $8,
           observaciones = coalesce($9, observaciones)
       where idcaja_sesion = $10`,
      [cerradaEn, cerradaPor, totals.ingresos, totals.egresos, money(totals.ingresos - totals.egresos),
        efectivoEsperado, efectivoContado, money(efectivoContado - efectivoEsperado), observaciones, id]
    );

    return getCajaSesion(id, client);
  });
}

async function editarSaldoInicialCaja({ id, saldoInicialEfectivo }) {
  if (!id) throw new Error("Debe indicar la sesión de caja.");
  const saldo = money(saldoInicialEfectivo);
  if (saldo < 0) throw new Error("El saldo inicial no puede ser negativo.");

  return withTransaction(async (client) => {
    const sessionResult = await client.query(
      `select * from caja_sesiones where idcaja_sesion = $1 for update`,
      [id]
    );
    const session = sessionResult.rows[0];
    if (!session) throw new Error("Sesión de caja no encontrada.");

    const movimientos = session.estado === "CERRADA"
      ? (await client.query(
        `select * from caja_sesion_movimientos
         where fk_idcaja_sesion = $1
         order by ocurrido_en, idcaja_sesion_movimiento`,
        [id]
      )).rows
      : await (async () => {
        const { desde, hasta } = cajaDateRange(session.abierta_en);
        return getCajaMovimientosElegibles(desde, hasta, client);
      })();
    const resumen = summarizeCajaMovimientos(movimientos, saldo);
    const efectivoContado = session.efectivo_contado === null
      ? null
      : money(session.efectivo_contado);
    const diferencia = efectivoContado === null
      ? null
      : money(efectivoContado - resumen.efectivoEsperado);

    await client.query(
      `update caja_sesiones
       set saldo_inicial_efectivo = $1,
           efectivo_esperado = $2,
           diferencia = $3
       where idcaja_sesion = $4`,
      [saldo, resumen.efectivoEsperado, diferencia, id]
    );

    return getCajaSesion(id, client);
  });
}

module.exports = {
  abrirCajaSesion,
  cajaDateRange,
  cerrarCajaSesion,
  editarSaldoInicialCaja,
  getCajaCreditosPendientes,
  getCajaMovimientosElegibles,
  registrarReversionVentaEnCaja,
  sincronizarCajaSesionAbierta,
  registrarVentaPagadaEnCaja,
  getCajaSesion,
  getCajaSesionAbierta,
  getCajaSesiones,
  summarizeCajaMovimientos
};
