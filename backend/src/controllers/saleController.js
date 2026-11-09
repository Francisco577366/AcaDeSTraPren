const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { round2 } = require('../utils/money');
const { todayLocal, currentPeriod } = require('../utils/today');
const { updateRecord } = require('../utils/persist');
const { recortarMargen } = require('../config/roles');
const { createCrudController } = require('./crudFactory');
const { peekNextId } = require('../models/plugins/autoIncrement');
const { mongoose, Sale, SaleItem, Product } = require('../models');
const { conFiltro } = require('../models/plugins/demo');

const MONTHS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

const populate = [
  { modelo: 'Student', campo: 'studentId', como: 'student', campos: 'id firstName lastName' },
];

function serialize(row) {
  if (!row) return row;
  const data = row.toJSON ? row.toJSON() : row;
  data.total = row.getTotal ? row.getTotal() : 0;
  data.balance = row.getBalance ? row.getBalance() : 0;
  data.profit = row.getProfit ? row.getProfit() : 0;
  data.buyer = data.student
    ? `${data.student.firstName} ${data.student.lastName || ''}`.trim()
    : data.buyerName || 'Publico general';
  data.itemsCount = data.items ? data.items.reduce((a, i) => a + Number(i.quantity || 0), 0) : 0;
  return data;
}

const receiptFor = (id) => `LIB-${String(id).padStart(6, '0')}`;

const crud = createCrudController({
  model: Sale,
  name: 'Venta',
  searchFields: ['receiptNumber', 'buyerName', 'reference', 'notes'],
  filterFields: ['status', 'method', 'studentId'],
  dateField: 'saleDate',
  populate,
  order: { id: -1 },
  cascade: 'Sale',
  serialize,
});


/**
 * Devuelve al inventario la mercancia de una venta. Lo usan anular y borrar,
 * que son las dos formas de deshacerla: teniendolo aqui no puede pasar que
 * una de las dos se olvide de reponer el stock.
 */
async function devolverStock(renglones, sesion) {
  for (const item of renglones) {
    if (!item.productId) continue;
    const product = await Product.findOne({ id: item.productId }).session(sesion);
    if (product) {
      product.stock = Number(product.stock) + Number(item.quantity);
      await product.save({ session: sesion });
    }
  }
}

/** Devuelve la venta con sus renglones y el comprador ya resueltos. */
async function recargar(id) {
  const venta = await Sale.findOne({ id });
  if (!venta) return null;
  const items = await SaleItem.find({ saleId: id }).sort({ id: 1 }).lean();
  const [fila] = await crud.adjuntar([serialize(venta)]);
  fila.items = items;
  fila.itemsCount = items.reduce((a, i) => a + Number(i.quantity || 0), 0);
  fila.buyer = fila.student
    ? `${fila.student.firstName} ${fila.student.lastName || ''}`.trim()
    : fila.buyerName || 'Publico general';
  return fila;
}

/**
 * Registra una venta completa: valida el stock, congela nombre y precios de
 * cada producto y descuenta el inventario. Todo dentro de una transaccion
 * para que no quede una venta a medias si algo falla.
 */
const create = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) throw ApiError.badRequest('La venta debe tener al menos un producto');

  /*
   * Todo dentro de una transaccion: se descuenta stock, se crea la venta y
   * se crean sus renglones. A medias, el inventario quedaria mintiendo.
   * Mongo solo admite transacciones sobre un replica set; Atlas lo es, y el
   * contenedor local esta configurado como uno para comportarse igual.
   */
  const sesion = await mongoose.startSession();
  let sale;
  try {
    await sesion.withTransaction(async () => {
    const lines = [];
    let subtotal = 0;
    let cost = 0;

    for (const item of items) {
      const quantity = Number(item.quantity || 0);
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw ApiError.badRequest('La cantidad de cada producto debe ser un entero mayor a cero');
      }

      const product = await Product.findOne({ id: Number(item.productId) }).session(sesion);
      if (!product) throw ApiError.badRequest(`El producto ${item.productId} no existe`);
      if (Number(product.stock) < quantity) {
        throw ApiError.badRequest(
          `No hay stock suficiente de "${product.name}": quedan ${product.stock}`
        );
      }

      // El precio puede ajustarse en el momento; el costo siempre es el real.
      const unitPrice = item.unitPrice === undefined || item.unitPrice === null || item.unitPrice === ''
        ? Number(product.price)
        : Number(item.unitPrice);
      const lineSubtotal = round2(unitPrice * quantity);

      lines.push({
        productId: product.id,
        name: product.name,
        quantity,
        unitPrice: round2(unitPrice),
        unitCost: round2(product.cost),
        subtotal: lineSubtotal,
      });

      subtotal = round2(subtotal + lineSubtotal);
      cost = round2(cost + Number(product.cost) * quantity);

      product.stock = Number(product.stock) - quantity;
      await product.save({ session: sesion });
    }

    let discount = round2(req.body.discount || 0);
    if (discount > subtotal) {
      throw ApiError.badRequest('El descuento no puede superar el subtotal');
    }
    let surcharge = 0;

    /*
     * El precio que se escribe manda sobre el calculado. Una impresion a
     * color no cuesta lo mismo segun cuanto color lleve, asi que el precio
     * de lista es solo un punto de partida: si el cobrado no coincide, la
     * diferencia se guarda como descuento o como recargo. Los renglones se
     * dejan intactos para que sigan cuadrando con lo que se entrego.
     */
    const charged = req.body.chargedTotal;
    if (charged !== undefined && charged !== null && charged !== '') {
      const target = round2(charged);
      if (target < 0) throw ApiError.badRequest('El precio cobrado no puede ser negativo');

      const base = round2(subtotal - discount);
      if (target < base) discount = round2(discount + (base - target));
      else surcharge = round2(target - base);
    }

    const total = round2(subtotal - discount + surcharge);
    const paidAmount = round2(req.body.paidAmount ?? total);
    if (paidAmount > total + 0.009) {
      throw ApiError.badRequest('El monto recibido no puede superar el precio cobrado');
    }

    const [created] = await Sale.create(
      [{
        receiptNumber: receiptFor(await peekNextId(Sale.collection.name)),
        studentId: req.body.studentId || null,
        buyerName: req.body.buyerName || null,
        saleDate: req.body.saleDate || todayLocal(),
        subtotal,
        discount,
        surcharge,
        cost,
        paidAmount,
        method: req.body.method || 'efectivo',
        reference: req.body.reference || null,
        notes: req.body.notes || null,
        registeredById: req.user ? req.user.id : null,
      }],
      { session: sesion }
    );

    await SaleItem.create(
      lines.map((l) => ({ ...l, saleId: created.id })),
      { session: sesion }
    );

    sale = created;
    });
  } finally {
    await sesion.endSession();
  }

  res.status(201).json({ success: true, data: await recargar(sale.id), message: 'Venta registrada' });
});

/** Registra un abono sobre una venta a credito. */
const settle = asyncHandler(async (req, res) => {
  const sale = await Sale.findOne({ id: Number(req.params.id) });
  if (!sale) throw ApiError.notFound('Venta no encontrada');
  if (sale.status === 'anulado') throw ApiError.badRequest('La venta esta anulada');

  const amount = Number(req.body.amount || 0);
  if (amount <= 0) throw ApiError.badRequest('El monto del abono debe ser mayor a cero');

  const balance = sale.getBalance();
  if (amount > balance + 0.009) {
    throw ApiError.badRequest(`El abono excede el saldo pendiente (${balance.toFixed(2)})`);
  }

  await updateRecord(sale, {
    paidAmount: round2(Number(sale.paidAmount || 0) + amount),
    method: req.body.method || sale.method,
    reference: req.body.reference || sale.reference,
  });

  res.json({ success: true, data: await recargar(sale.id), message: 'Abono registrado' });
});

/**
 * Anula una venta y devuelve la mercancia al inventario. No se borra para
 * que quede la traza; para corregir una venta, anulala y registrala de nuevo.
 */
const voidSale = asyncHandler(async (req, res) => {
  const sale = await Sale.findOne({ id: Number(req.params.id) });
  if (!sale) throw ApiError.notFound('Venta no encontrada');
  if (sale.status === 'anulado') throw ApiError.badRequest('La venta ya esta anulada');

  const renglones = await SaleItem.find({ saleId: sale.id }).lean();
  const sesion = await mongoose.startSession();
  try {
    await sesion.withTransaction(async () => {
      await devolverStock(renglones, sesion);
      sale.status = 'anulado';
      sale.notes = [sale.notes, `Anulada: ${req.body.reason || 'sin motivo indicado'}`]
        .filter(Boolean)
        .join(' | ');
      await sale.save({ session: sesion });
    });
  } finally {
    await sesion.endSession();
  }

  res.json({
    success: true,
    data: await recargar(sale.id),
    message: 'Venta anulada y stock devuelto al inventario',
  });
});

/** Indicadores de la libreria: ventas, cobrado, por cobrar y ganancia. */
const summary = asyncHandler(async (req, res) => {
  const now = new Date();
  const year = Number(req.query.year) || currentPeriod().year;
  const month = Number(req.query.month) || currentPeriod().month;
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  const vivas = { status: { $ne: 'anulado' } };
  // El precio final de una venta: subtotal menos descuento mas recargo.
  const TOTALES = {
    count: { $sum: 1 },
    total: { $sum: Sale.TOTAL },
    paid: { $sum: '$paidAmount' },
    cost: { $sum: '$cost' },
  };

  const [monthRows, totalRows, byStatus, topRows, monthlyRows] = await Promise.all([
    Sale.aggregate([
      { $match: { ...vivas, saleDate: { $gte: monthStart, $lte: monthEnd } } },
      { $group: { _id: null, ...TOTALES } },
    ]),
    Sale.aggregate([
      { $match: vivas },
      { $group: { _id: null, ...TOTALES } },
    ]),
    Sale.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: Sale.TOTAL }, paid: { $sum: '$paidAmount' } } },
      { $sort: { _id: 1 } },
    ]),
    /*
     * Lo mas vendido. Se agrupa por NOMBRE y no por producto: el renglon
     * guarda una copia del nombre, asi que un producto borrado del catalogo
     * sigue contando en la estadistica de lo que de verdad se vendio.
     */
    SaleItem.aggregate([
      {
        // Con pipeline para poder filtrar: el sub-pipeline de un $lookup no
        // pasa por los hooks del modelo, y sin esto un renglon de la visita
        // podria emparejarse con una venta de la academia.
        $lookup: {
          from: Sale.collection.name,
          let: { venta: '$saleId' },
          pipeline: [{ $match: conFiltro({ $expr: { $eq: ['$id', '$$venta'] } }) }],
          as: 'venta',
        },
      },
      { $unwind: '$venta' },
      { $match: { 'venta.status': { $ne: 'anulado' } } },
      {
        $group: {
          _id: '$name',
          units: { $sum: '$quantity' },
          total: { $sum: '$subtotal' },
          cost: { $sum: { $multiply: ['$unitCost', '$quantity'] } },
        },
      },
      { $sort: { units: -1 } },
      { $limit: 10 },
    ]),
    // Ventas mes a mes del anio, para ver la temporada de un vistazo.
    Sale.aggregate([
      { $match: { ...vivas, saleDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } } },
      {
        $group: {
          _id: { $toInt: { $substr: ['$saleDate', 5, 2] } },
          count: { $sum: 1 },
          total: { $sum: Sale.TOTAL },
          cost: { $sum: '$cost' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const monthly = monthRows[0] || {};
  const overall = totalRows[0] || {};

  /**
   * Que parte de lo vendido es ganancia. Se mide sobre la venta, no sobre el
   * costo: "de cada 100 que entran, cuantos quedan". Sin ventas no hay
   * porcentaje que calcular, asi que devuelve 0 en vez de dividir por cero.
   */
  const marginPct = (total, profit) =>
    Number(total) > 0 ? round2((Number(profit) / Number(total)) * 100) : 0;

  const monthTotal = round2(monthly.total);
  const monthProfit = round2(Number(monthly.total || 0) - Number(monthly.cost || 0));
  const overallTotal = round2(overall.total);
  const overallProfit = round2(Number(overall.total || 0) - Number(overall.cost || 0));
  const unitsSold = topRows.reduce((a, r) => a + Number(r.units || 0), 0);

  // Las cifras de margen se quitan para quien no es administrador: son las
  // mismas que el panel ya oculta, por otra puerta.
  const datos = {
      period: { year, month, monthStart, monthEnd },
      month: {
        count: Number(monthly.count || 0),
        total: round2(monthly.total),
        paid: round2(monthly.paid),
        pending: round2(Number(monthly.total || 0) - Number(monthly.paid || 0)),
        profit: monthProfit,
        marginPct: marginPct(monthTotal, monthProfit),
      },
      overall: {
        count: Number(overall.count || 0),
        total: overallTotal,
        paid: round2(overall.paid),
        pending: round2(Number(overall.total || 0) - Number(overall.paid || 0)),
        profit: overallProfit,
        marginPct: marginPct(overallTotal, overallProfit),
        unitsSold,
      },
      byStatus: byStatus.map((r) => ({
        status: r._id,
        count: r.count,
        total: round2(r.total),
        paid: round2(r.paid),
        balance: round2(Number(r.total || 0) - Number(r.paid || 0)),
      })),
      topProducts: topRows.map((r) => {
        const total = round2(r.total);
        const profit = round2(Number(r.total || 0) - Number(r.cost || 0));
        return {
          name: r._id,
          units: r.units,
          total,
          profit,
          marginPct: marginPct(total, profit),
          // Que parte del total vendido representa este producto.
          sharePct: marginPct(overallTotal, total),
        };
      }),
      byMonth: Array.from({ length: 12 }, (_, i) => {
        const found = monthlyRows.find((r) => Number(r._id) === i + 1);
        const total = found ? round2(found.total) : 0;
        const profit = found ? round2(Number(found.total || 0) - Number(found.cost || 0)) : 0;
        return {
          month: i + 1,
          label: MONTHS[i],
          count: found ? found.count : 0,
          total,
          profit,
          marginPct: marginPct(total, profit),
        };
      }),
  };

  res.json({ success: true, data: recortarMargen(datos, req.user) });
});

/** Eliminar una venta devuelve el stock igual que anularla. */
const remove = asyncHandler(async (req, res) => {
  const sale = await Sale.findOne({ id: Number(req.params.id) });
  if (!sale) throw ApiError.notFound('Venta no encontrada');

  // Una venta ya anulada devolvio el stock al anularse: no se devuelve dos veces.
  const renglones = sale.status === 'anulado' ? [] : await SaleItem.find({ saleId: sale.id }).lean();
  const sesion = await mongoose.startSession();
  try {
    await sesion.withTransaction(async () => {
      await devolverStock(renglones, sesion);
      await SaleItem.deleteMany({ saleId: sale.id }, { session: sesion });
      await sale.deleteOne({ session: sesion });
    });
  } finally {
    await sesion.endSession();
  }

  res.json({ success: true, message: 'Venta eliminada' });
});

module.exports = {
  list: crud.list,
  getOne: crud.getOne,
  create,
  settle,
  voidSale,
  summary,
  remove,
};

// Reexportamos por si otro modulo necesita el mismo formato de salida.
module.exports.serialize = serialize;
// NOT_VOID se exportaba para que otros modulos filtraran lo anulado; nadie lo
// usa y en Mongo el filtro es literal: { status: { $ne: 'anulado' } }.
