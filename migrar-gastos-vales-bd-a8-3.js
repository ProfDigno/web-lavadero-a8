const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const config = require("./src/config").db;

const SOURCE_DATABASE = "bdlavadero_a8_3";
const TARGET_DATABASE = "bdlavaderoA8_web";
const REPORT_PATH = path.join(__dirname, "tmp", "migracion-gastos-vales-bd-a8-3-report.json");

function normalize(value) {
  return String(value ?? "").trim().toUpperCase();
}

function amount(value) {
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

function mapState(state) {
  if (state === "ANULADO") return "ANULADO";
  if (state === "EMITIDO" || state === "TABLET") return "EMITIDO";
  throw new Error(`Estado origen no soportado: ${state}`);
}

async function main() {
  const source = await connect(SOURCE_DATABASE);
  const target = await connect(TARGET_DATABASE);
  let committed = false;

  try {
    const sourceTypes = (await source.query(`
      select idgasto_tipo, nombre, activo, fecha_creado, creado_por
      from gasto_tipo order by idgasto_tipo
    `)).rows;
    const sourceExpenses = (await source.query(`
      select g.idgasto, g.fecha_creado, g.creado_por, g.descripcion, g.monto_gasto,
             g.es_pago, g.estado, g.fk_idgasto_tipo, gt.nombre as gasto_tipo_nombre,
             g.fk_idforma_pago, fp.nombre as forma_pago_nombre
      from gasto g
      join gasto_tipo gt on gt.idgasto_tipo = g.fk_idgasto_tipo
      join forma_pago fp on fp.idforma_pago = g.fk_idforma_pago
      order by g.idgasto
    `)).rows;
    const sourceVales = (await source.query(`
      select v.idpersonal_vale, v.fecha_creado, v.creado_por, v.descripcion,
             v.monto_personal_vale, v.es_pago, v.estado,
             v.fk_idpersonal_pago, v.fk_idforma_pago, fp.nombre as forma_pago_nombre,
             v.fk_idpersonal, p.nombre as personal_nombre
      from personal_vale v
      join forma_pago fp on fp.idforma_pago = v.fk_idforma_pago
      join personal p on p.idpersonal = v.fk_idpersonal
      order by v.idpersonal_vale
    `)).rows;

    const targetExpenseCount = await count(target, "gastos");
    const targetValeCount = await count(target, "vales_personal");
    if (targetExpenseCount || targetValeCount) {
      throw new Error(`El destino no está vacío: gastos=${targetExpenseCount}, vales=${targetValeCount}.`);
    }
    if (sourceExpenses.length !== 35) throw new Error(`Se esperaban 35 gastos origen y se encontraron ${sourceExpenses.length}.`);
    if (sourceVales.length !== 413) throw new Error(`Se esperaban 413 vales origen y se encontraron ${sourceVales.length}.`);

    const targetTypes = (await target.query("select idgasto_tipo, nombre, activo from gasto_tipo order by idgasto_tipo")).rows;
    const targetForms = (await target.query("select idforma_pago, nombre from formas_pago")).rows;
    const targetPeople = (await target.query("select idpersonal from personal")).rows;
    const targetTypeByName = new Map(targetTypes.map((row) => [normalize(row.nombre), row]));
    const targetFormByName = new Map(targetForms.map((row) => [normalize(row.nombre), row.idforma_pago]));
    const targetPeopleById = new Set(targetPeople.map((row) => row.idpersonal));
    const sourceTypeNames = new Set(sourceTypes.map((row) => normalize(row.nombre)));
    const validationErrors = [];
    const expensePaymentMap = { EFECTIVO: "EFECTIVO", TRANSFERENCIA: "TRANSFERENCIA" };
    const valePaymentMap = { EFECTIVO: "EFECTIVO", TARJETA: "TARJETA_DEBITO", TRANSFERENCIA: "TRANSFERENCIA" };

    for (const row of sourceExpenses) {
      const formName = normalize(row.forma_pago_nombre);
      if (!expensePaymentMap[formName] || !targetFormByName.has(expensePaymentMap[formName])) {
        validationErrors.push(`Gasto ${row.idgasto}: forma de pago no compatible (${formName}).`);
      }
      try { mapState(row.estado); } catch (error) { validationErrors.push(`Gasto ${row.idgasto}: ${error.message}`); }
      if (!sourceTypeNames.has(normalize(row.gasto_tipo_nombre))) validationErrors.push(`Gasto ${row.idgasto}: tipo inexistente.`);
    }
    for (const row of sourceVales) {
      const formName = normalize(row.forma_pago_nombre);
      if (!valePaymentMap[formName] || !targetFormByName.has(valePaymentMap[formName])) {
        validationErrors.push(`Vale ${row.idpersonal_vale}: forma de pago no compatible (${formName}).`);
      }
      try { mapState(row.estado); } catch (error) { validationErrors.push(`Vale ${row.idpersonal_vale}: ${error.message}`); }
      if (!targetPeopleById.has(row.fk_idpersonal)) validationErrors.push(`Vale ${row.idpersonal_vale}: personal ${row.fk_idpersonal} inexistente en destino.`);
    }
    if (validationErrors.length) {
      throw new Error(`Validación previa fallida (${validationErrors.length} errores):\n${validationErrors.slice(0, 20).join("\n")}`);
    }

    const tabletExpenses = sourceExpenses.filter((row) => normalize(row.estado) === "TABLET");
    const tabletVales = sourceVales.filter((row) => normalize(row.estado) === "TABLET");
    const differentPayers = sourceVales.filter((row) => row.fk_idpersonal_pago !== row.fk_idpersonal);

    await target.query("begin");

    const typeMap = new Map();
    for (const row of sourceTypes) {
      const key = normalize(row.nombre);
      let targetType = targetTypeByName.get(key);
      if (!targetType) {
        const inserted = await target.query(`
          insert into gasto_tipo (nombre, activo, fecha_creado, creado_por)
          values ($1,$2,$3,$4)
          returning idgasto_tipo, nombre, activo
        `, [row.nombre, row.activo, row.fecha_creado, row.creado_por]);
        targetType = inserted.rows[0];
        targetTypeByName.set(key, targetType);
      }
      typeMap.set(row.idgasto_tipo, targetType.idgasto_tipo);
    }

    for (const row of sourceExpenses) {
      const formName = expensePaymentMap[normalize(row.forma_pago_nombre)];
      await target.query(`
        insert into gastos (
          idgasto, fk_idgasto_tipo, fecha_gasto, descripcion, monto,
          fk_idforma_pago, estado, fecha_creado, creado_por, ocurrido_en
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$8)
      `, [
        row.idgasto,
        typeMap.get(row.fk_idgasto_tipo),
        row.fecha_creado,
        row.descripcion,
        row.monto_gasto,
        targetFormByName.get(formName),
        mapState(row.estado),
        row.fecha_creado,
        row.creado_por
      ]);
    }

    for (const row of sourceVales) {
      const formName = valePaymentMap[normalize(row.forma_pago_nombre)];
      await target.query(`
        insert into vales_personal (
          idvales_personal, fk_idpersonal, fecha_pago, monto,
          fk_idforma_pago, estado, fecha_creado, creado_por, ocurrido_en
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$7)
      `, [
        row.idpersonal_vale,
        row.fk_idpersonal,
        row.fecha_creado,
        row.monto_personal_vale,
        targetFormByName.get(formName),
        mapState(row.estado),
        row.fecha_creado,
        row.creado_por
      ]);
    }

    await target.query("select setval('gastos_id_seq', (select max(idgasto) from gastos), true)");
    await target.query("select setval('vales_personal_id_seq', (select max(idvales_personal) from vales_personal), true)");

    const counts = {
      gastos: await count(target, "gastos"),
      vales: await count(target, "vales_personal")
    };
    if (counts.gastos !== sourceExpenses.length || counts.vales !== sourceVales.length) {
      throw new Error(`Conteos no coinciden: ${JSON.stringify(counts)}.`);
    }

    const orphanCheck = await target.query(`
      select
        (select count(*) from gastos g left join gasto_tipo gt on gt.idgasto_tipo=g.fk_idgasto_tipo where gt.idgasto_tipo is null) as orphan_expense_types,
        (select count(*) from gastos g left join formas_pago fp on fp.idforma_pago=g.fk_idforma_pago where fp.idforma_pago is null) as orphan_expense_forms,
        (select count(*) from vales_personal v left join personal p on p.idpersonal=v.fk_idpersonal where p.idpersonal is null) as orphan_vale_people,
        (select count(*) from vales_personal v left join formas_pago fp on fp.idforma_pago=v.fk_idforma_pago where fp.idforma_pago is null) as orphan_vale_forms
    `);
    if (Object.values(orphanCheck.rows[0]).some((value) => Number(value) !== 0)) {
      throw new Error(`Se detectaron referencias huérfanas: ${JSON.stringify(orphanCheck.rows[0])}`);
    }

    const totals = await target.query(`
      select
        (select count(*)::int from gastos) as gastos_count,
        (select coalesce(sum(monto),0) from gastos) as gastos_total,
        (select count(*)::int from vales_personal) as vales_count,
        (select coalesce(sum(monto),0) from vales_personal) as vales_total,
        (select last_value from gastos_id_seq) as gastos_sequence,
        (select last_value from vales_personal_id_seq) as vales_sequence
    `);

    await target.query("commit");
    committed = true;

    const report = {
      source_database: SOURCE_DATABASE,
      target_database: TARGET_DATABASE,
      migrated_at: new Date().toISOString(),
      gastos: sourceExpenses.length,
      vales: sourceVales.length,
      tipos_gasto_origen: sourceTypes,
      tipos_gasto_destino: [...targetTypeByName.values()],
      estados_tablet_mapeados: {
        gastos: tabletExpenses.map((row) => ({ idgasto: row.idgasto, estado_origen: row.estado, estado_destino: "EMITIDO" })),
        vales: tabletVales.map((row) => ({ idpersonal_vale: row.idpersonal_vale, estado_origen: row.estado, estado_destino: "EMITIDO" }))
      },
      pagadores_diferentes: differentPayers.map((row) => ({
        idpersonal_vale: row.idpersonal_vale,
        fk_idpersonal_beneficiario: row.fk_idpersonal,
        personal_beneficiario: row.personal_nombre,
        fk_idpersonal_pago_origen: row.fk_idpersonal_pago
      })),
      totales_destino: totals.rows[0],
      siguiente_idgasto: Number(totals.rows[0].gastos_sequence) + 1,
      siguiente_idvales_personal: Number(totals.rows[0].vales_sequence) + 1
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

    console.log(`Migración confirmada: ${counts.gastos} gastos y ${counts.vales} vales.`);
    console.log(`Tipos de gasto disponibles en destino: ${targetTypeByName.size}.`);
    console.log(`Estados TABLET convertidos: ${tabletExpenses.length} gastos y ${tabletVales.length} vales.`);
    console.log(`Vales con pagador distinto: ${differentPayers.length}.`);
    console.log(`Próximos IDs: gasto=${report.siguiente_idgasto}, vale=${report.siguiente_idvales_personal}.`);
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
