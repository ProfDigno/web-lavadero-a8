const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { Client } = require("pg");
const config = require("./src/config").db;

const SOURCE_DATABASE = "bdlavadero_a8_3";
const TARGET_DATABASE = "bdlavaderoA8_web";
const REPORT_PATH = path.join(__dirname, "tmp", "migracion-completa-bd-a8-3-report.json");
const BACKUP_PATH = path.join(__dirname, "tmp", `bdlavaderoA8_web-${new Date().toISOString().replace(/[:.]/g, "-")}.backup`);

const maintenanceTables = [
  "clientes",
  "personal",
  "servicios",
  "servicio_grupo",
  "formas_pago",
  "gasto_tipo",
  "grupo_cliente",
  "usuarios",
  "usuario_roll",
  "usuario_roll_item",
  "usuario_roll_evento",
  "facturasend_config"
];

const requiredTargetTables = [
  "lavados",
  "lavado_servicios",
  "lavado_personal",
  "gastos",
  "vales_personal",
  "comisiones_diarias",
  "grupo_cliente_creditos",
  "facturas",
  "factura_items",
  "caja_sesiones",
  "caja_sesion_movimientos",
  "caja_sesion_formas_pago",
  "caja_sesion_denominaciones"
];

const requiredSourceTables = [
  "lavado",
  "lavado_item_servicio",
  "lavado_item_personal",
  "gasto",
  "personal_vale",
  "cliente",
  "personal",
  "servicio",
  "forma_pago",
  "gasto_tipo"
];

function parseArgs() {
  const mode = process.argv[2] || "preflight";
  return { mode, skipBackup: process.argv.includes("--skip-backup") };
}

async function connect(database) {
  const client = new Client({ ...config, database });
  await client.connect();
  return client;
}

async function tableNames(client) {
  const result = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
  `);
  return new Set(result.rows.map((row) => row.table_name));
}

async function sequenceNames(client) {
  const result = await client.query(`
    select sequence_name
    from information_schema.sequences
    where sequence_schema = 'public'
  `);
  return new Set(result.rows.map((row) => row.sequence_name));
}

async function counts(client, tables) {
  const result = {};
  for (const table of tables) {
    const row = await client.query(`select count(*)::int as count from ${table}`);
    result[table] = row.rows[0].count;
  }
  return result;
}

async function sourceSummary(source) {
  return {
    lavado: (await source.query("select count(*)::int as count from lavado")).rows[0].count,
    lavado_servicios_validos: (await source.query("select count(*)::int as count from lavado_item_servicio where fk_idservicio <> 0")).rows[0].count,
    lavado_personal: (await source.query("select count(*)::int as count from lavado_item_personal")).rows[0].count,
    gastos: (await source.query("select count(*)::int as count from gasto")).rows[0].count,
    vales: (await source.query("select count(*)::int as count from personal_vale")).rows[0].count
  };
}

async function maintenanceSnapshot(target) {
  return counts(target, maintenanceTables);
}

async function preflight() {
  const source = await connect(SOURCE_DATABASE);
  const target = await connect(TARGET_DATABASE);
  try {
    const sourceTables = await tableNames(source);
    const targetTables = await tableNames(target);
    const targetSequences = await sequenceNames(target);
    const sourceCounts = await sourceSummary(source);
    const targetOperational = await counts(target, requiredTargetTables);
    const maintenanceBefore = await maintenanceSnapshot(target);

    const missingSourceTables = requiredSourceTables.filter((table) => !sourceTables.has(table));
    const missingTargetTables = requiredTargetTables.filter((table) => !targetTables.has(table));
    const requiredSequences = [
      "lavados_id_seq",
      "gastos_id_seq",
      "vales_personal_id_seq",
      "comisiones_diarias_id_seq"
    ];
    const missingSequences = requiredSequences.filter((sequence) => !targetSequences.has(sequence));
    if (missingSourceTables.length || missingTargetTables.length || missingSequences.length) {
      throw new Error(JSON.stringify({ missingSourceTables, missingTargetTables, missingSequences }));
    }

    const expected = {
      lavado: 5252,
      lavado_servicios_validos: 7086,
      lavado_personal: 8681,
      gastos: 35,
      vales: 413
    };
    const mismatches = Object.keys(expected)
      .filter((key) => sourceCounts[key] !== expected[key])
      .map((key) => ({ item: key, expected: expected[key], actual: sourceCounts[key] }));
    if (mismatches.length) throw new Error(`Los conteos del origen no coinciden: ${JSON.stringify(mismatches)}`);

    console.log("Preflight correcto.");
    console.log(JSON.stringify({ sourceCounts, targetOperational, maintenanceBefore }, null, 2));
    return { sourceCounts, targetOperational, maintenanceBefore };
  } finally {
    await source.end();
    await target.end();
  }
}

function runBackup(skipBackup) {
  if (skipBackup) {
    console.log("Respaldo omitido por --skip-backup; debe existir un respaldo manual previo.");
    return null;
  }
  fs.mkdirSync(path.dirname(BACKUP_PATH), { recursive: true });
  const result = spawnSync(process.env.PG_DUMP_PATH || "pg_dump", [
    "--format=custom",
    "--file", BACKUP_PATH,
    "--host", String(config.host),
    "--port", String(config.port),
    "--username", String(config.user),
    TARGET_DATABASE
  ], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: config.password }
  });
  if (result.error) {
    throw new Error(`No se pudo ejecutar pg_dump: ${result.error.message}. Realice el respaldo manualmente y use --skip-backup.`);
  }
  if (result.status !== 0) {
    throw new Error(`pg_dump falló: ${(result.stderr || result.stdout || "sin detalle").trim()}`);
  }
  console.log(`Respaldo creado: ${BACKUP_PATH}`);
  return BACKUP_PATH;
}

async function runCleanup() {
  const target = await connect(TARGET_DATABASE);
  try {
    const sql = fs.readFileSync(path.join(__dirname, "LIMPIAR_DATOS_OPERATIVOS.sql"), "utf8");
    await target.query(sql);
    console.log("Limpieza operativa confirmada.");
  } finally {
    await target.end();
  }
}

function runNodeScript(script) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
    cwd: __dirname,
    stdio: "inherit",
    env: process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Falló la etapa ${script} con código ${result.status}.`);
}

async function finalReport(preflightData, backupPath) {
  const source = await connect(SOURCE_DATABASE);
  const target = await connect(TARGET_DATABASE);
  try {
    const sourceCounts = await sourceSummary(source);
    const operationalCounts = await counts(target, requiredTargetTables);
    const maintenanceAfter = await maintenanceSnapshot(target);
    const targetTotals = await target.query(`
      select
        (select count(*)::int from lavados) as lavados,
        (select count(*)::int from lavado_servicios) as lavado_servicios,
        (select count(*)::int from lavado_personal) as lavado_personal,
        (select count(*)::int from gastos) as gastos,
        (select coalesce(sum(monto), 0) from gastos) as gastos_total,
        (select count(*)::int from vales_personal) as vales,
        (select coalesce(sum(monto), 0) from vales_personal) as vales_total,
        (select count(*)::int from comisiones_diarias) as comisiones_diarias,
        (select last_value from lavados_id_seq) as ultimo_idlavado,
        (select last_value from gastos_id_seq) as ultimo_idgasto,
        (select last_value from vales_personal_id_seq) as ultimo_idvales_personal,
        (select last_value from comisiones_diarias_id_seq) as ultimo_idcomisiones_diarias
    `);

    const individualReports = {};
    for (const file of [
      "migracion-lavados-bd-a8-3-report.json",
      "migracion-gastos-vales-bd-a8-3-report.json",
      "recalculo-comisiones-diarias-report.json"
    ]) {
      const filePath = path.join(__dirname, "tmp", file);
      if (fs.existsSync(filePath)) individualReports[file] = JSON.parse(fs.readFileSync(filePath, "utf8"));
    }

    const report = {
      generated_at: new Date().toISOString(),
      source_database: SOURCE_DATABASE,
      target_database: TARGET_DATABASE,
      backup_path: backupPath,
      preflight: preflightData,
      source_counts: sourceCounts,
      target_operational_counts: operationalCounts,
      maintenance_after: maintenanceAfter,
      target_totals: targetTotals.rows[0],
      individual_reports: individualReports
    };
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
    console.log(`Reporte consolidado: ${REPORT_PATH}`);
    return report;
  } finally {
    await source.end();
    await target.end();
  }
}

async function main() {
  const { mode, skipBackup } = parseArgs();
  if (!["preflight", "execute", "report"].includes(mode)) {
    throw new Error("Modo inválido. Use preflight, execute o report.");
  }
  if (mode === "preflight") {
    await preflight();
    return;
  }
  if (mode === "report") {
    await finalReport(null, null);
    return;
  }

  const preflightData = await preflight();
  const backupPath = runBackup(skipBackup);
  await runCleanup();
  runNodeScript("migrar-clientes-faltantes-bd-a8-3.js");
  runNodeScript("migrar-lavados-bd-a8-3.js");
  runNodeScript("migrar-gastos-vales-bd-a8-3.js");
  runNodeScript("recalcular-comisiones-diarias.js");
  await finalReport(preflightData, backupPath);
  console.log("Migración completa finalizada correctamente.");
}

main().catch((error) => {
  console.error("Migración completa no realizada:", error.message);
  process.exitCode = 1;
});
