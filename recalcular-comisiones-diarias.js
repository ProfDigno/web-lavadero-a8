const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const config = require("./src/config").db;

const REPORT_PATH = path.join(__dirname, "tmp", "recalculo-comisiones-diarias-report.json");

function number(value) {
  return Number(value || 0);
}

function equalMoney(left, right) {
  return Math.abs(number(left) - number(right)) < 0.005;
}

async function main() {
  const client = new Client(config);
  await client.connect();
  let committed = false;

  try {
    const beforeSources = await client.query(`
      select
        (select count(*)::int from lavados) as lavados,
        (select count(*)::int from lavado_personal) as lavado_personal,
        (select count(*)::int from vales_personal) as vales
    `);

    await client.query("begin");
    await client.query("truncate table comisiones_diarias restart identity");

    await client.query(`
      with reparto as (
        select l.fecha_creado::date as fecha,
               lp.fk_idpersonal,
               lp.comision,
               floor(round(l.total * 100) / count(*) over (partition by lp.fk_idlavado))
                 + case
                     when row_number() over (partition by lp.fk_idlavado order by lp.idlavado_personal) = 1
                     then mod(round(l.total * 100), count(*) over (partition by lp.fk_idlavado))
                     else 0
                   end as total_servicios_centavos
        from lavados l
        join lavado_personal lp on lp.fk_idlavado = l.idlavado
        where l.estado <> 'ANULADO'
      ),
      lavados_por_personal as (
        select fecha,
               fk_idpersonal,
               count(*)::int as total_lavados_emitidos,
               sum(total_servicios_centavos) / 100.0 as total_servicios,
               sum(comision) as total_comision_40
        from reparto
        group by fecha, fk_idpersonal
      ),
      vales_por_personal as (
        select fecha_pago as fecha,
               fk_idpersonal,
               sum(monto) as total_vales
        from vales_personal
        where estado <> 'ANULADO'
        group by fecha_pago, fk_idpersonal
      ),
      claves as (
        select fecha, fk_idpersonal from lavados_por_personal
        union
        select fecha, fk_idpersonal from vales_por_personal
      )
      insert into comisiones_diarias (
        fecha, fk_idpersonal, total_lavados_emitidos, total_servicios,
        total_comision_40, total_vales, creado_por
      )
      select c.fecha,
             c.fk_idpersonal,
             coalesce(l.total_lavados_emitidos, 0),
             coalesce(l.total_servicios, 0),
             coalesce(l.total_comision_40, 0),
             coalesce(v.total_vales, 0),
             'RECALCULO MIGRACION'
      from claves c
      left join lavados_por_personal l
        on l.fecha = c.fecha and l.fk_idpersonal = c.fk_idpersonal
      left join vales_por_personal v
        on v.fecha = c.fecha and v.fk_idpersonal = c.fk_idpersonal
      order by c.fecha, c.fk_idpersonal
    `);

    await client.query("select setval('comisiones_diarias_id_seq', (select max(idcomisiones_diarias) from comisiones_diarias), true)");

    const totals = await client.query(`
      select
        (select count(*)::int from comisiones_diarias) as filas,
        (select coalesce(sum(total_lavados_emitidos), 0) from comisiones_diarias) as lavados_recalculados,
        (select coalesce(sum(total_servicios), 0) from comisiones_diarias) as servicios_recalculados,
        (select coalesce(sum(total_comision_40), 0) from comisiones_diarias) as comision_recalculada,
        (select coalesce(sum(total_vales), 0) from comisiones_diarias) as vales_recalculados,
        (select count(*)::int from comisiones_diarias where total_lavados_emitidos = 0 and total_vales > total_comision_40) as filas_solo_vales_con_saldo_negativo
    `);
    const expected = await client.query(`
      select
        (select count(*) from lavados l join lavado_personal lp on lp.fk_idlavado = l.idlavado where l.estado <> 'ANULADO') as lavados_esperados,
        (select coalesce(sum(l.total), 0) from lavados l where l.estado <> 'ANULADO') as servicios_esperados,
        (select coalesce(sum(lp.comision), 0) from lavado_personal lp join lavados l on l.idlavado = lp.fk_idlavado where l.estado <> 'ANULADO') as comision_esperada,
        (select coalesce(sum(monto), 0) from vales_personal where estado <> 'ANULADO') as vales_esperados
    `);
    const orphanCheck = await client.query(`
      select count(*)::int as huérfanos
      from comisiones_diarias cd
      left join personal p on p.idpersonal = cd.fk_idpersonal
      where p.idpersonal is null
    `);

    const actual = totals.rows[0];
    const expectedRow = expected.rows[0];
    if (number(actual.lavados_recalculados) !== number(expectedRow.lavados_esperados)) {
      throw new Error(`Lavados no coinciden: ${actual.lavados_recalculados} vs ${expectedRow.lavados_esperados}.`);
    }
    if (!equalMoney(actual.servicios_recalculados, expectedRow.servicios_esperados)) {
      throw new Error(`Servicios no coinciden: ${actual.servicios_recalculados} vs ${expectedRow.servicios_esperados}.`);
    }
    if (!equalMoney(actual.comision_recalculada, expectedRow.comision_esperada)) {
      throw new Error(`Comisiones no coinciden: ${actual.comision_recalculada} vs ${expectedRow.comision_esperada}.`);
    }
    if (!equalMoney(actual.vales_recalculados, expectedRow.vales_esperados)) {
      throw new Error(`Vales no coinciden: ${actual.vales_recalculados} vs ${expectedRow.vales_esperados}.`);
    }
    if (Number(orphanCheck.rows[0].huérfanos) !== 0) {
      throw new Error(`Hay ${orphanCheck.rows[0].huérfanos} filas de comisión sin personal.`);
    }

    const afterSources = await client.query(`
      select
        (select count(*)::int from lavados) as lavados,
        (select count(*)::int from lavado_personal) as lavado_personal,
        (select count(*)::int from vales_personal) as vales
    `);
    if (JSON.stringify(beforeSources.rows[0]) !== JSON.stringify(afterSources.rows[0])) {
      throw new Error(`Cambió una tabla fuente: antes=${JSON.stringify(beforeSources.rows[0])}, después=${JSON.stringify(afterSources.rows[0])}.`);
    }

    await client.query("commit");
    committed = true;

    const report = {
      recalculated_at: new Date().toISOString(),
      source_counts_before_after: { before: beforeSources.rows[0], after: afterSources.rows[0] },
      totals: actual,
      expected: expectedRow,
      next_idcomisiones_diarias: Number(actual.filas) + 1
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
    console.log(`Comisiones reconstruidas: ${actual.filas} filas.`);
    console.log(`Lavados: ${actual.lavados_recalculados}; servicios: ${actual.servicios_recalculados}; comisión: ${actual.comision_recalculada}; vales: ${actual.vales_recalculados}.`);
    console.log(`Filas solo con vales y saldo negativo: ${actual.filas_solo_vales_con_saldo_negativo}.`);
    console.log(`Reporte: ${REPORT_PATH}`);
  } catch (error) {
    if (!committed) {
      try { await client.query("rollback"); } catch (_) { /* conexión ya cerrada o transacción inexistente */ }
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Recalculación no realizada:", error.message);
  process.exitCode = 1;
});
