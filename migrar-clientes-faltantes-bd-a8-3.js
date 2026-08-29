const { Client } = require("pg");
const config = require("./src/config").db;

const SOURCE_DATABASE = "bdlavadero_a8_3";
const TARGET_DATABASE = "bdlavaderoA8_web";

function normalize(value) {
  return String(value ?? "").trim().toUpperCase();
}

async function connect(database) {
  const client = new Client({ ...config, database });
  await client.connect();
  return client;
}

async function main() {
  const source = await connect(SOURCE_DATABASE);
  const target = await connect(TARGET_DATABASE);
  try {
    const sourceRows = await source.query(`
      select distinct on (c.idcliente)
        c.idcliente, c.fecha_creado, c.creado_por, c.chapa, c.razon_social,
        c.ruc, c.direccion, c.telefono, c.activo, c.fk_idcliente_grupo,
        v.nombre as vehiculo_nombre, cg.nombre as grupo_nombre
      from cliente c
      join lavado l on l.fk_idcliente = c.idcliente
      left join vehiculo v on v.idvehiculo = c.fk_idvehiculo
      left join cliente_grupo cg on cg.idcliente_grupo = c.fk_idcliente_grupo
      order by c.idcliente
    `);
    const targetRows = await target.query("select idcliente, chapa from clientes");
    const targetByPlate = new Map(targetRows.rows.map((row) => [normalize(row.chapa), row.idcliente]));
    const targetGroups = await target.query("select idgrupo_cliente, nombre from grupo_cliente");
    const targetGroupByName = new Map(targetGroups.rows.map((row) => [normalize(row.nombre), row.idgrupo_cliente]));
    const missing = sourceRows.rows.filter((row) => !targetByPlate.has(normalize(row.chapa)));

    await target.query("begin");
    for (const row of missing) {
      await target.query(`
        insert into clientes (
          chapa, marca_modelo, ruc, nombre, direccion, telefono,
          fk_idgrupo_cliente, activo, fecha_creado, creado_por
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [
        row.chapa,
        row.vehiculo_nombre || "",
        row.ruc,
        row.razon_social,
        row.direccion,
        row.telefono,
        targetGroupByName.get(normalize(row.grupo_nombre)) || null,
        row.activo,
        row.fecha_creado,
        row.creado_por
      ]);
    }
    await target.query("select setval('clientes_id_seq', (select max(idcliente) from clientes), true)");
    await target.query("commit");
    console.log(`Clientes faltantes migrados: ${missing.length}.`);
  } catch (error) {
    try { await target.query("rollback"); } catch (_rollbackError) {}
    throw error;
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((error) => {
  console.error("Migración de clientes no realizada:", error.message);
  process.exitCode = 1;
});
