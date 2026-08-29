const { query, withTransaction } = require("./db");
const { registrarReversionVentaEnCaja, registrarVentaPagadaEnCaja } = require("./caja-cierres");

function integerValue(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${label} debe ser un numero entero.`);
  return parsed;
}

async function getVentaOptions() {
  const [formasPago, productos] = await Promise.all([
    query(
      `select idforma_pago, nombre, icono_ruta, color
       from formas_pago
       where activo = true
         and mostrar_despues_crear = true
         and nombre <> 'ANULADO'
       order by nombre, idforma_pago`
    ),
    query(
      `select idproducto, codigo, nombre, precio_venta, stock_actual
       from producto
       where activo = true
       order by nombre, codigo, idproducto`
    )
  ]);
  return {
    formasPago: formasPago.rows,
    productos: productos.rows
  };
}

async function listarVentas({ desde = "", hasta = "", cliente = "", condiciones = [], pagina = 1 } = {}) {
  const pageSize = 100;
  const page = Math.max(1, Number(pagina) || 1);
  const filters = [];
  const params = [];
  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (desde) filters.push(`v.fecha_venta::date >= ${addParam(desde)}`);
  if (hasta) filters.push(`v.fecha_venta::date <= ${addParam(hasta)}`);
  if (cliente) {
    const term = `%${cliente}%`;
    const placeholder = addParam(term);
    filters.push(`(
      coalesce(c.chapa, '') ilike ${placeholder}
      or coalesce(c.marca_modelo, '') ilike ${placeholder}
      or coalesce(c.nombre, '') ilike ${placeholder}
      or coalesce(c.ruc, '') ilike ${placeholder}
      or coalesce(c.telefono, '') ilike ${placeholder}
    )`);
  }
  const validConditions = condiciones.filter((condition) => ["CONTADO", "CREDITO"].includes(condition));
  if (validConditions.length) {
    const placeholders = validConditions.map(addParam);
    filters.push(`v.condicion in (${placeholders.join(', ')})`);
  }
  const where = filters.length ? `where ${filters.join(" and ")}` : "";
  const countResult = await query(
    `select count(*)::int as total
     from venta v
     left join clientes c on c.idcliente = v.fk_idcliente
     ${where}`,
    params
  );
  const listParams = [...params, pageSize, (page - 1) * pageSize];
  const result = await query(
    `select v.idventa, v.numero, v.fecha_venta, v.condicion, v.estado,
            v.subtotal, v.total, v.fk_idcliente, v.fk_idforma_pago,
            v.pagado_en, v.anulado_en,
            coalesce(
              nullif(concat_ws(' - ', nullif(trim(c.chapa), ''), nullif(trim(c.marca_modelo), '')), ''),
              '-'
            ) as cliente_nombre,
            fp.nombre as forma_pago, fp.color as forma_pago_color,
            coalesce(count(vi.idventa_item), 0)::int as cantidad_items
     from venta v
     left join clientes c on c.idcliente = v.fk_idcliente
     join formas_pago fp on fp.idforma_pago = v.fk_idforma_pago
     left join venta_item vi on vi.fk_idventa = v.idventa
     ${where}
     group by v.idventa, c.chapa, c.marca_modelo, fp.nombre, fp.color
     order by v.fecha_venta desc, v.idventa desc
     limit $${listParams.length - 1} offset $${listParams.length}`,
    listParams
  );
  return {
    rows: result.rows,
    total: Number(countResult.rows[0]?.total || 0),
    page,
    pageSize
  };
}

async function obtenerVenta(id) {
  const ventaResult = await query(
    `select v.*, coalesce(
              nullif(concat_ws(' - ', nullif(trim(c.chapa), ''), nullif(trim(c.marca_modelo), '')), ''),
              '-'
            ) as cliente_nombre,
            c.chapa, c.marca_modelo, fp.nombre as forma_pago, fp.color as forma_pago_color
     from venta v
     left join clientes c on c.idcliente = v.fk_idcliente
     join formas_pago fp on fp.idforma_pago = v.fk_idforma_pago
     where v.idventa = $1`,
    [id]
  );
  const venta = ventaResult.rows[0] || null;
  if (!venta) return null;
  const itemsResult = await query(
    `select vi.*, p.codigo, p.nombre as producto_nombre
     from venta_item vi
     join producto p on p.idproducto = vi.fk_idproducto
     where vi.fk_idventa = $1
     order by vi.idventa_item`,
    [id]
  );
  venta.items = itemsResult.rows;
  return venta;
}

function normalizeItems(productIds, quantities) {
  const ids = Array.isArray(productIds) ? productIds : [productIds];
  const counts = Array.isArray(quantities) ? quantities : [quantities];
  const items = [];
  const seen = new Set();
  ids.forEach((rawProductId, index) => {
    if (String(rawProductId || "").trim() === "") return;
    const productId = integerValue(rawProductId, "El producto");
    const cantidad = integerValue(counts[index], "La cantidad");
    if (productId <= 0) throw new Error("El producto seleccionado no es valido.");
    if (cantidad <= 0) throw new Error("La cantidad debe ser mayor que cero.");
    if (seen.has(productId)) throw new Error("No puede repetir un producto en la misma venta.");
    seen.add(productId);
    items.push({ productId, cantidad });
  });
  if (!items.length) throw new Error("Agregue al menos un producto a la venta.");
  return items;
}

async function crearVenta({ clienteId, formaPagoId, condicion, productIds, quantities, creadoPor }) {
  const fkCliente = clienteId ? integerValue(clienteId, "El cliente") : null;
  const fkFormaPago = integerValue(formaPagoId, "La forma de pago");
  if (fkFormaPago <= 0) throw new Error("Seleccione una forma de pago.");
  if (!["CONTADO", "CREDITO"].includes(condicion)) throw new Error("Seleccione una condicion valida.");
  const items = normalizeItems(productIds, quantities);

  return withTransaction(async (client) => {
    const paymentResult = await client.query(
      `select idforma_pago from formas_pago
       where idforma_pago = $1 and activo = true and nombre <> 'ANULADO'`,
      [fkFormaPago]
    );
    if (!paymentResult.rows.length) throw new Error("La forma de pago no esta disponible.");

    if (fkCliente !== null) {
      const clientResult = await client.query(
        `select idcliente from clientes where idcliente = $1 and activo = true`,
        [fkCliente]
      );
      if (!clientResult.rows.length) throw new Error("El cliente no esta disponible.");
    }

    const productResult = await client.query(
      `select idproducto, codigo, nombre, precio_compra, precio_venta, stock_actual
       from producto
       where idproducto = any($1::int[]) and activo = true
       order by idproducto
       for update`,
      [items.map((item) => item.productId)]
    );
    if (productResult.rows.length !== items.length) throw new Error("Uno de los productos no esta disponible.");

    const productsById = new Map(productResult.rows.map((product) => [Number(product.idproducto), product]));
    let subtotal = 0;
    const detailedItems = items.map((item) => {
      const product = productsById.get(item.productId);
      if (!product) throw new Error("Uno de los productos no esta disponible.");
      if (Number(product.stock_actual) < item.cantidad) {
        throw new Error(`Stock insuficiente para ${product.nombre}. Disponible: ${product.stock_actual}.`);
      }
      const itemSubtotal = Number(product.precio_venta) * item.cantidad;
      subtotal += itemSubtotal;
      return { ...item, product, itemSubtotal };
    });

    const saleResult = await client.query(
      `insert into venta (
         fk_idcliente, fk_idforma_pago, condicion, estado,
         subtotal, total, creado_por
       ) values ($1, $2, $3, $4, $5, $5, $6)
       returning idventa, numero`,
      [fkCliente, fkFormaPago, condicion, condicion === "CONTADO" ? "PAGADO" : "PENDIENTE", subtotal, creadoPor]
    );
    const sale = saleResult.rows[0];

    await registrarVentaPagadaEnCaja(sale.idventa, client);

    for (const item of detailedItems) {
      await client.query(
        `insert into venta_item (
           fk_idventa, fk_idproducto, precio_venta, precio_compra,
           cantidad, subtotal, creado_por
         ) values ($1, $2, $3, $4, $5, $6, $7)`,
        [sale.idventa, item.product.idproducto, item.product.precio_venta, item.product.precio_compra,
          item.cantidad, item.itemSubtotal, creadoPor]
      );
      await client.query(
        `update producto
         set stock_actual = stock_actual - $1
         where idproducto = $2`,
        [item.cantidad, item.product.idproducto]
      );
    }
    return sale;
  });
}

async function anularVenta(id, anuladoPor) {
  return withTransaction(async (client) => {
    const saleResult = await client.query(
      `select idventa, estado from venta where idventa = $1 for update`,
      [id]
    );
    const sale = saleResult.rows[0];
    if (!sale) throw new Error("La venta no existe.");
    if (sale.estado === "ANULADO") throw new Error("La venta ya esta anulada.");

    const cajaResult = await client.query(
      `select
         exists (
           select 1 from caja_sesion_movimientos csm
           where csm.fk_idventa = $1 and csm.tipo = 'INGRESO'
         ) as ingreso_registrado,
         exists (
           select 1 from caja_sesiones cs
           where cs.estado = 'ABIERTA'
         ) as caja_abierta`,
      [id]
    );
    const caja = cajaResult.rows[0] || {};
    if (caja.ingreso_registrado && !caja.caja_abierta) {
      throw new Error("Debe abrir una sesion de caja para registrar la reversion de esta venta.");
    }

    const itemsResult = await client.query(
      `select vi.fk_idproducto, vi.cantidad, p.nombre
       from venta_item vi
       join producto p on p.idproducto = vi.fk_idproducto
       where vi.fk_idventa = $1
       for update`,
      [id]
    );
    for (const item of itemsResult.rows) {
      await client.query(
        `update producto set stock_actual = stock_actual + $1 where idproducto = $2`,
        [item.cantidad, item.fk_idproducto]
      );
    }
    await client.query(
      `update venta
       set estado = 'ANULADO', anulado_en = now(), anulado_por = $1
       where idventa = $2`,
      [anuladoPor, id]
    );
    await registrarReversionVentaEnCaja(id, client);
  });
}

async function marcarVentaPagada(id, pagadoPor) {
  await withTransaction(async (client) => {
    const result = await client.query(
      `update venta
       set estado = 'PAGADO', pagado_en = now(), pagado_por = $1
       where idventa = $2 and condicion = 'CREDITO' and estado = 'PENDIENTE'
       returning idventa`,
      [pagadoPor, id]
    );
    if (!result.rows.length) throw new Error("Solo se pueden marcar como pagadas las ventas a credito pendientes.");
    await registrarVentaPagadaEnCaja(id, client);
  });
}

module.exports = {
  anularVenta,
  crearVenta,
  getVentaOptions,
  listarVentas,
  marcarVentaPagada,
  obtenerVenta
};
