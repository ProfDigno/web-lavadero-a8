const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const config = require("./src/config").db;

const SOURCE_DATABASE = "bdlavadero_a8_3";
const TARGET_DATABASE = "bdlavaderoA8_web";
const REPORT_PATH = path.join(__dirname, "tmp", "migracion-lavados-bd-a8-3-report.json");

function normalize(value) {
  return String(value ?? "").trim().toUpperCase();
}

function money(value) {
  return Number(value || 0);
}

async function connect(database) {
  const client = new Client({ ...config, database });
  await client.connect();
  return client;
}

async function count(client, table) {
  const result = await client.query(`select count(*)::int as count from ${table}`);
  return result.rows[0].count;
}

async function main() {
  const source = await connect(SOURCE_DATABASE);
  const target = await connect(TARGET_DATABASE);
  let committed = false;

  try {
    const [sourceLavados, sourceServices, sourcePersonal, sourceClients, sourcePaymentForms, sourceServiceDetails, sourceInvalidServiceDetails, sourcePersonalDetails, sourceProductDetails] = await Promise.all([
      source.query(`
        select l.idlavado, l.fecha_creado, l.creado_por, l.condicion, l.estado,
               l.monto_lavado, l.monto_total_comi, l.fk_idcliente,
               l.fk_idcliente_grupo_credito, c.chapa, fp.nombre as forma_pago_nombre
        from lavado l
        join cliente c on c.idcliente = l.fk_idcliente
        join forma_pago fp on fp.idforma_pago = l.fk_idforma_pago
        order by l.idlavado
      `),
      source.query("select idservicio, nombre from servicio order by idservicio"),
      source.query("select idpersonal, nombre from personal order by idpersonal"),
      source.query("select idcliente, chapa from cliente order by idcliente"),
      source.query("select idforma_pago, nombre from forma_pago order by idforma_pago"),
      source.query(`
        select lis.idlavado_item_servicio, lis.fk_idlavado, lis.fk_idservicio,
               lis.nombre, lis.precio, lis.fecha_creado, lis.creado_por
        from lavado_item_servicio lis
        where lis.fk_idservicio <> 0
        order by lis.fk_idlavado, lis.idlavado_item_servicio
      `),
      source.query(`
        select lis.idlavado_item_servicio, lis.fk_idlavado, lis.fk_idservicio,
               lis.nombre, lis.precio, lis.fecha_creado, lis.creado_por
        from lavado_item_servicio lis
        where lis.fk_idservicio = 0
        order by lis.fk_idlavado, lis.idlavado_item_servicio
      `),
      source.query(`
        select lip.idlavado_item_personal, lip.fk_idlavado, lip.fk_idpersonal,
               lip.monto_indi_comi, lip.fecha_creado, lip.creado_por
        from lavado_item_personal lip
        order by lip.fk_idlavado, lip.idlavado_item_personal
      `),
      source.query(`
        select lip.idlavado_item_producto, lip.fk_idlavado, lip.fk_idproducto,
               lip.descripcion, lip.precio_venta, lip.precio_compra, lip.cantidad,
               lip.fecha_creado, lip.creado_por
        from lavado_item_producto lip
        order by lip.fk_idlavado, lip.idlavado_item_producto
      `)
    ]);

    const [targetLavados, targetServiceDetails, targetPersonalDetails, targetClients, targetPeople, targetServices, targetPaymentForms] = await Promise.all([
      count(target, "lavados"),
      count(target, "lavado_servicios"),
      count(target, "lavado_personal"),
      target.query("select idcliente, chapa from clientes"),
      target.query("select idpersonal, nombre from personal"),
      target.query("select idservicio, nombre from servicios"),
      target.query("select idforma_pago, nombre from formas_pago")
    ]);

    if (targetLavados || targetServiceDetails || targetPersonalDetails) {
      throw new Error(`El destino no está vacío: lavados=${targetLavados}, lavado_servicios=${targetServiceDetails}, lavado_personal=${targetPersonalDetails}.`);
    }
    if (!sourceLavados.rowCount) throw new Error("La tabla origen lavado no contiene registros.");

    const targetClientByPlate = new Map(targetClients.rows.map((row) => [normalize(row.chapa), row.idcliente]));
    const targetPeopleById = new Map(targetPeople.rows.map((row) => [row.idpersonal, row.idpersonal]));
    const targetServiceById = new Map(targetServices.rows.map((row) => [row.idservicio, row]));
    const targetPaymentByName = new Map(targetPaymentForms.rows.map((row) => [normalize(row.nombre), row.idforma_pago]));
    const sourceClientById = new Map(sourceClients.rows.map((row) => [row.idcliente, row]));
    const sourceServiceById = new Map(sourceServices.rows.map((row) => [row.idservicio, row]));
    const sourcePersonalById = new Map(sourcePersonal.rows.map((row) => [row.idpersonal, row]));
    const sourcePaymentById = new Map(sourcePaymentForms.rows.map((row) => [row.idforma_pago, normalize(row.nombre)]));

    const paymentMapping = {
      EFECTIVO: "EFECTIVO",
      TARJETA: "TARJETA_DEBITO",
      TRANSFERENCIA: "TRANSFERENCIA"
    };
    const clientMap = new Map();
    const unsupportedCreditLinks = new Set();
    const validationErrors = [];

    for (const row of sourceLavados.rows) {
      const targetClientId = targetClientByPlate.get(normalize(row.chapa));
      if (!targetClientId) validationErrors.push(`Lavado ${row.idlavado}: chapa ${row.chapa} no existe en clientes destino.`);
      else clientMap.set(row.fk_idcliente, targetClientId);
      if (row.fk_idcliente_grupo_credito) unsupportedCreditLinks.add(row.fk_idcliente_grupo_credito);

      const sourcePaymentName = normalize(row.forma_pago_nombre);
      const targetPaymentName = paymentMapping[sourcePaymentName];
      if (!targetPaymentName || !targetPaymentByName.has(targetPaymentName)) {
        validationErrors.push(`Lavado ${row.idlavado}: forma de pago ${sourcePaymentName} sin equivalencia destino.`);
      }
    }

    // El mapa anterior usa el nombre de forma de pago traído por el JOIN.
    // Se valida además que no haya valores origen fuera de las reglas definidas.
    for (const row of sourceLavados.rows) {
      const sourcePaymentName = normalize(row.forma_pago_nombre);
      if (!paymentMapping[sourcePaymentName]) {
        validationErrors.push(`Lavado ${row.idlavado}: forma de pago origen no soportada (${sourcePaymentName}).`);
      }
    }

    const usedPeople = new Set(sourcePersonalDetails.rows.map((row) => row.fk_idpersonal));
    for (const idpersonal of usedPeople) {
      if (!sourcePersonalById.has(idpersonal) || !targetPeopleById.has(idpersonal)) {
        validationErrors.push(`Personal ${idpersonal} no tiene correspondencia por ID en destino.`);
      }
    }

    for (const row of sourceServiceDetails.rows) {
      const sourceService = sourceServiceById.get(row.fk_idservicio);
      const targetService = targetServiceById.get(row.fk_idservicio);
      if (!sourceService || !targetService || normalize(sourceService.nombre) !== normalize(targetService.nombre)) {
        validationErrors.push(`Servicio ${row.fk_idservicio} no coincide por ID y nombre.`);
      }
    }

    const serviceLavadoIds = new Set(sourceServiceDetails.rows.map((row) => row.fk_idlavado));
    const personalByLavado = new Map();
    for (const row of sourcePersonalDetails.rows) {
      if (!personalByLavado.has(row.fk_idlavado)) personalByLavado.set(row.fk_idlavado, []);
      personalByLavado.get(row.fk_idlavado).push(row);
    }
    for (const row of sourceLavados.rows) {
      if (!serviceLavadoIds.has(row.idlavado)) validationErrors.push(`Lavado ${row.idlavado} no tiene servicio compatible.`);
      if (!personalByLavado.has(row.idlavado)) validationErrors.push(`Lavado ${row.idlavado} no tiene personal relacionado.`);
    }

    if (validationErrors.length) {
      throw new Error(`Validación previa fallida (${validationErrors.length} errores):\n${validationErrors.slice(0, 20).join("\n")}`);
    }

    console.log(`Validación correcta: ${sourceLavados.rowCount} lavados, ${sourceServiceDetails.rowCount} servicios y ${sourcePersonalDetails.rowCount} relaciones de personal.`);
    console.log(`Productos no migrables: ${sourceProductDetails.rowCount} en ${new Set(sourceProductDetails.rows.map((row) => row.fk_idlavado)).size} lavados.`);
    console.log(`Detalles de servicio inválidos no migrados: ${sourceInvalidServiceDetails.rowCount}.`);
    console.log(`Vínculos de crédito no migrables: ${unsupportedCreditLinks.size}.`);

    await target.query("begin");

    for (const row of sourceLavados.rows) {
      const targetPaymentName = paymentMapping[normalize(row.forma_pago_nombre)];
      const firstPersonal = personalByLavado.get(row.idlavado)[0];
      const targetClientId = clientMap.get(row.fk_idcliente);
      const total = money(row.monto_lavado);
      const commission = money(row.monto_total_comi);
      const saldo = total - commission;

      await target.query(`
        insert into lavados (
          idlavado, fk_idcliente, condicion, fk_idforma_pago, estado,
          total, comision_personal, saldo_lavadero, fecha_creado, creado_por,
          fk_idgrupo_cliente_creditos
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,null)
      `, [
        row.idlavado,
        targetClientId,
        row.condicion,
        targetPaymentByName.get(targetPaymentName),
        row.estado,
        total,
        commission,
        saldo,
        row.fecha_creado,
        row.creado_por
      ]);

      if (!targetPeopleById.has(firstPersonal.fk_idpersonal)) {
        throw new Error(`Personal principal ${firstPersonal.fk_idpersonal} no existe para lavado ${row.idlavado}.`);
      }
    }

    for (const row of sourceServiceDetails.rows) {
      await target.query(`
        insert into lavado_servicios (fk_idlavado, fk_idservicio, precio, fecha_creado, creado_por)
        values ($1,$2,$3,$4,$5)
      `, [row.fk_idlavado, row.fk_idservicio, row.precio, row.fecha_creado, row.creado_por]);
    }

    for (const row of sourcePersonalDetails.rows) {
      await target.query(`
        insert into lavado_personal (fk_idlavado, fk_idpersonal, comision, fecha_creado, creado_por)
        values ($1,$2,$3,$4,$5)
      `, [row.fk_idlavado, row.fk_idpersonal, row.monto_indi_comi, row.fecha_creado, row.creado_por]);
    }

    await target.query("select setval('lavados_id_seq', (select max(idlavado) from lavados), true)");

    const [insertedLavados, insertedServices, insertedPeople] = await Promise.all([
      count(target, "lavados"),
      count(target, "lavado_servicios"),
      count(target, "lavado_personal")
    ]);
    if (insertedLavados !== sourceLavados.rowCount || insertedServices !== sourceServiceDetails.rowCount || insertedPeople !== sourcePersonalDetails.rowCount) {
      throw new Error(`Conteos no coinciden: destino lavados=${insertedLavados}, servicios=${insertedServices}, personal=${insertedPeople}.`);
    }

    const integrity = await target.query(`
      select
        (select count(*) from lavados l left join clientes c on c.idcliente=l.fk_idcliente where c.idcliente is null) as orphan_clients,
        (select count(*) from lavado_servicios ls left join lavados l on l.idlavado=ls.fk_idlavado where l.idlavado is null) as orphan_service_lavados,
        (select count(*) from lavado_servicios ls left join servicios s on s.idservicio=ls.fk_idservicio where s.idservicio is null) as orphan_services,
        (select count(*) from lavado_personal lp left join lavados l on l.idlavado=lp.fk_idlavado where l.idlavado is null) as orphan_person_lavados,
        (select count(*) from lavado_personal lp left join personal p on p.idpersonal=lp.fk_idpersonal where p.idpersonal is null) as orphan_people
    `);
    const integrityRow = integrity.rows[0];
    if (Object.values(integrityRow).some((value) => Number(value) !== 0)) {
      throw new Error(`Se detectaron referencias huérfanas: ${JSON.stringify(integrityRow)}`);
    }

    const totals = await target.query(`
      select count(*)::int as count,
             coalesce(sum(total),0) as total,
             coalesce(sum(comision_personal),0) as commission,
             min(idlavado) as min_id,
             max(idlavado) as max_id
      from lavados
    `);
    await target.query("commit");
    committed = true;

    const report = {
      source_database: SOURCE_DATABASE,
      target_database: TARGET_DATABASE,
      migrated_at: new Date().toISOString(),
      lavados: sourceLavados.rowCount,
      lavado_servicios: sourceServiceDetails.rowCount,
      lavado_personal: sourcePersonalDetails.rowCount,
      servicios_invalidos_no_migrados: sourceInvalidServiceDetails.rowCount,
      detalle_servicios_invalidos: sourceInvalidServiceDetails.rows,
      productos_no_migrados: sourceProductDetails.rowCount,
      lavados_con_productos: [...new Set(sourceProductDetails.rows.map((row) => row.fk_idlavado))],
      detalle_productos: sourceProductDetails.rows,
      vinculos_credito_no_migrados: [...unsupportedCreditLinks],
      totales_destino: totals.rows[0],
      siguiente_idlavado: Number(totals.rows[0].max_id) + 1
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

    console.log(`Migración confirmada: ${sourceLavados.rowCount} lavados, ${sourceServiceDetails.rowCount} servicios y ${sourcePersonalDetails.rowCount} relaciones de personal.`);
    console.log(`Siguiente idlavado: ${report.siguiente_idlavado}.`);
    console.log(`Reporte: ${REPORT_PATH}`);
  } catch (error) {
    if (!committed) {
      try { await target.query("rollback"); } catch (_) { /* conexión ya cerrada o transacción inexistente */ }
    }
    throw error;
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((error) => {
  console.error("Migración no realizada:", error.message);
  process.exitCode = 1;
});
