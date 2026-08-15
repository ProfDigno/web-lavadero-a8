const { query, withTransaction } = require("./db");

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function sourceValues(movement) {
  return [
    movement.origen === "LAVADO" ? movement.source_id : null,
    movement.origen === "CREDITO" ? movement.source_id : null,
    movement.origen === "GASTO" ? movement.source_id : null,
    movement.origen === "VALE" ? movement.source_id : null
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

  const [formsResult, movementsResult, denominationsResult] = await Promise.all([
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
    )
  ]);

  return {
    ...session,
    formas_pago: formsResult.rows,
    movimientos: movementsResult.rows,
    denominaciones: denominationsResult.rows
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
  const [lavados, creditos, gastos, vales] = await Promise.all([
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
    )
  ]);

  return [...lavados.rows, ...creditos.rows, ...gastos.rows, ...vales.rows]
    .sort((a, b) => new Date(a.ocurrido_en) - new Date(b.ocurrido_en));
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
    const movimientos = await getCajaMovimientosElegibles(session.abierta_en, cerradaEn, client);
    const formas = new Map();

    for (const movement of movimientos) {
      const source = sourceValues(movement);
      await client.query(
        `insert into caja_sesion_movimientos (
           fk_idcaja_sesion, tipo, origen,
           fk_idlavado, fk_idgrupo_cliente_creditos, fk_idgasto, fk_idvales_personal,
           fk_idforma_pago, monto, ocurrido_en,
           forma_pago_nombre, forma_pago_icono, forma_pago_color, referencia, descripcion
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          id, movement.tipo, movement.origen,
          source[0], source[1], source[2], source[3],
          movement.fk_idforma_pago, money(movement.monto), movement.ocurrido_en,
          movement.forma_pago_nombre, movement.forma_pago_icono, movement.forma_pago_color,
          movement.referencia, movement.descripcion
        ]
      );

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
         ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
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

module.exports = {
  abrirCajaSesion,
  cerrarCajaSesion,
  getCajaMovimientosElegibles,
  getCajaSesion,
  getCajaSesionAbierta,
  getCajaSesiones
};
