const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool(config.db);

const TABLE_PRIMARY_KEYS = {
  caja_sesion_denominaciones: "idcaja_sesion_denominacion",
  caja_sesion_formas_pago: "idcaja_sesion_forma_pago",
  caja_sesion_movimientos: "idcaja_sesion_movimiento",
  caja_sesiones: "idcaja_sesion",
  clientes: "idcliente",
  comisiones_diarias: "idcomisiones_diarias",
  factura_items: "idfactura_items",
  facturas: "idfactura",
  facturasend_config: "idfacturasend_config",
  formas_pago: "idforma_pago",
  gasto_tipo: "idgasto_tipo",
  gastos: "idgasto",
  grupo_cliente: "idgrupo_cliente",
  grupo_cliente_creditos: "idgrupo_cliente_creditos",
  lavado_personal: "idlavado_personal",
  lavado_servicios: "idlavado_servicios",
  lavados: "idlavado",
  personal: "idpersonal",
  producto: "idproducto",
  producto_categoria: "idproducto_categoria",
  servicio_grupo: "idservicio_grupo",
  servicios: "idservicio",
  usuario_roll: "idusuario_roll",
  usuario_roll_evento: "idusuario_roll_evento",
  usuario_roll_item: "idusuario_roll_item",
  usuarios: "idusuario",
  venta: "idventa",
  venta_item: "idventa_item",
  vales_personal: "idvales_personal"
};

const SQL_KEYWORDS = new Set([
  "as", "on", "where", "left", "right", "inner", "outer", "full", "cross",
  "join", "set", "values", "returning", "order", "group", "limit", "offset",
  "for", "update", "having", "union"
]);

function rewriteSql(text) {
  let sql = String(text);
  const aliases = new Map();
  const sourcePattern = /\b(?:from|join)\s+([a-z_][a-z0-9_]*)(?:\s+(?:as\s+)?([a-z_][a-z0-9_]*))?/gi;
  let match;
  while ((match = sourcePattern.exec(sql))) {
    const table = match[1].toLowerCase();
    if (!TABLE_PRIMARY_KEYS[table]) continue;
    const candidate = match[2] && !SQL_KEYWORDS.has(match[2].toLowerCase()) ? match[2] : table;
    aliases.set(candidate, TABLE_PRIMARY_KEYS[table]);
  }


  const mutationMatch = sql.match(/\b(?:update|insert\s+into)\s+([a-z_][a-z0-9_]*)/i);
  if (mutationMatch && TABLE_PRIMARY_KEYS[mutationMatch[1].toLowerCase()]) {
    aliases.set(mutationMatch[1], TABLE_PRIMARY_KEYS[mutationMatch[1].toLowerCase()]);
  }

  for (const [alias, primaryKey] of aliases) {
    const qualified = new RegExp(`\\b${alias}\\.id\\b`, "gi");
    sql = sql.replace(qualified, `${alias}.${primaryKey}`);
  }

  if (aliases.size === 1) {
    const primaryKey = [...aliases.values()][0];
    sql = sql.replace(/(?<![a-z0-9_.])id\b/gi, primaryKey);
  }

  return sql;
}

function normalizeResult(result) {
  if (!result || !Array.isArray(result.rows)) return result;
  return {
    ...result,
    rows: result.rows.map((row) => {
      const normalized = { ...row };
      if (!Object.prototype.hasOwnProperty.call(normalized, "id")) {
        const idKeys = Object.keys(normalized).filter((key) => /^id[a-z_]/.test(key));
        if (idKeys.length === 1) normalized.id = normalized[idKeys[0]];
      }
      return normalized;
    })
  };
}

async function query(text, params) {
  return normalizeResult(await pool.query(rewriteSql(text), params));
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const transactionalClient = {
      query: async (text, params) => normalizeResult(await client.query(rewriteSql(text), params))
    };
    const result = await work(transactionalClient);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  withTransaction
};
