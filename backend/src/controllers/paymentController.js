const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { round2 } = require('../utils/money');
const { todayLocal, currentPeriod } = require('../utils/today');
const { updateRecord } = require('../utils/persist');
const { createCrudController } = require('./crudFactory');
const { ensureMonthlyCharges, receiptFor, MONTHS } = require('../services/monthlyCharges');
const { peekNextId } = require('../models/plugins/autoIncrement');
const { Payment } = require('../models');

const populate = [
  { modelo: 'Student', campo: 'studentId', como: 'student', campos: 'id firstName lastName documentId', nombreEn: 'studentName' },
  { modelo: 'StudentWork', campo: 'studentWorkId', como: 'studentWork', campos: 'id title price' },
];

function serialize(row) {
  if (!row) return row;
  const data = row.toJSON ? row.toJSON() : row;
  data.total = row.getTotal ? row.getTotal() : 0;
  data.balance = row.getBalance ? row.getBalance() : 0;
  // studentName lo compone la fabrica al adjuntar el alumno.
  if (data.periodMonth) {
    data.periodLabel = `${MONTHS[data.periodMonth - 1]} ${data.periodYear || ''}`.trim();
  }
  return data;
}

/** Correlativo tipo REC-000123, tomado del contador de la coleccion. */
async function nextReceiptNumber() {
  return receiptFor(await peekNextId(Payment.collection.name));
}

async function beforeWrite(body, req, existing) {
  if (!existing && !body.receiptNumber) body.receiptNumber = await nextReceiptNumber();
  if (!existing && !body.registeredById && req.user) body.registeredById = req.user.id;
  // El estado lo recalcula el modelo; solo respetamos la anulacion explicita.
  if (body.status && body.status !== 'anulado') delete body.status;
  return body;
}

/** Devuelve el cobro ya con el alumno adjunto y su nombre compuesto. */
async function recargar(id) {
  const fresco = await Payment.findOne({ id });
  const [fila] = await crud.adjuntar([serialize(fresco)]);
  return fila;
}

const crud = createCrudController({
  model: Payment,
  name: 'Pago',
  searchFields: ['concept', 'receiptNumber', 'reference'],
  filterFields: ['status', 'conceptType', 'method', 'studentId', 'periodMonth', 'periodYear'],
  dateField: 'paymentDate',
  populate,
  order: { id: -1 },
  serialize,
  beforeWrite,
});

/**
 * Registra un abono sobre un cobro existente. Suma al monto abonado
 * en lugar de reemplazarlo, para no perder el historial de cuotas.
 */
const settle = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ id: Number(req.params.id) });
  if (!payment) throw ApiError.notFound('Pago no encontrado');
  if (payment.status === 'anulado') throw ApiError.badRequest('El pago esta anulado');

  const amount = Number(req.body.amount || 0);
  if (amount <= 0) throw ApiError.badRequest('El monto del abono debe ser mayor a cero');

  const balance = payment.getBalance();
  if (amount > balance + 0.009) {
    throw ApiError.badRequest(`El abono excede el saldo pendiente (${balance.toFixed(2)})`);
  }

  await updateRecord(payment, {
    paidAmount: round2(Number(payment.paidAmount || 0) + amount),
    paymentDate: req.body.paymentDate || todayLocal(),
    method: req.body.method || payment.method,
    reference: req.body.reference || payment.reference,
    notes: req.body.notes || payment.notes,
  });

  res.json({ success: true, data: await recargar(payment.id), message: 'Abono registrado' });
});

/** Anula un cobro sin borrarlo, conservando la trazabilidad. */
const voidPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ id: Number(req.params.id) });
  if (!payment) throw ApiError.notFound('Pago no encontrado');

  await updateRecord(payment, {
    status: 'anulado',
    notes: [payment.notes, `Anulado: ${req.body.reason || 'sin motivo indicado'}`]
      .filter(Boolean)
      .join(' | '),
  });

  res.json({ success: true, data: await recargar(payment.id), message: 'Pago anulado' });
});

/** Reactiva un cobro previamente anulado. */
const restorePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ id: Number(req.params.id) });
  if (!payment) throw ApiError.notFound('Pago no encontrado');
  if (payment.status !== 'anulado') throw ApiError.badRequest('El pago no esta anulado');

  // Pasamos por pendiente para que el hook recalcule el estado real.
  await updateRecord(payment, { status: 'pendiente' });

  res.json({ success: true, data: await recargar(payment.id), message: 'Pago restaurado' });
});

/** Totales agregados por estado, metodo, concepto y mes. */
const summary = asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || currentPeriod().year;
  const vivos = { status: { $ne: 'anulado' } };

  const [byStatus, byMethod, byMonth, byConcept] = await Promise.all([
    Payment.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: Payment.TOTAL },
          paid: { $sum: '$paidAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Payment.aggregate([
      { $match: vivos },
      { $group: { _id: '$method', count: { $sum: 1 }, paid: { $sum: '$paidAmount' } } },
      { $sort: { _id: 1 } },
    ]),
    Payment.aggregate([
      // La fecha es texto aaaa-mm-dd: el anio se filtra por rango y el mes
      // se saca de la propia cadena, sin convertir nada a fecha.
      { $match: { ...vivos, paymentDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } } },
      {
        $group: {
          _id: { $toInt: { $substr: ['$paymentDate', 5, 2] } },
          count: { $sum: 1 },
          paid: { $sum: '$paidAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Payment.aggregate([
      { $match: vivos },
      { $group: { _id: '$conceptType', count: { $sum: 1 }, paid: { $sum: '$paidAmount' } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      year,
      byStatus: byStatus.map((r) => ({
        status: r._id,
        count: r.count,
        total: round2(r.total),
        paid: round2(r.paid),
        balance: round2(Number(r.total || 0) - Number(r.paid || 0)),
      })),
      byMethod: byMethod.map((r) => ({
        method: r._id,
        count: r.count,
        paid: round2(r.paid),
      })),
      byMonth: Array.from({ length: 12 }, (_, i) => {
        const found = byMonth.find((r) => Number(r._id) === i + 1);
        return {
          month: i + 1,
          label: MONTHS[i],
          paid: found ? round2(found.paid) : 0,
          count: found ? found.count : 0,
        };
      }),
      byConcept: byConcept.map((r) => ({
        conceptType: r._id,
        count: r.count,
        paid: round2(r.paid),
      })),
    },
  });
});

/**
 * Genera de un golpe la mensualidad del periodo para todos los alumnos
 * activos que tengan una mensualidad pactada, saltando las ya emitidas.
 *
 * El trabajo lo hace el mismo servicio que emite el mes solo al arrancar, para
 * que el boton y la emision automatica no puedan llegar a reglas distintas.
 */
const generateMonthly = asyncHandler(async (req, res) => {
  const result = await ensureMonthlyCharges({
    month: Number(req.body.month) || currentPeriod().month,
    year: Number(req.body.year) || currentPeriod().year,
    dueDay: req.body.dueDay,
    registeredById: req.user ? req.user.id : null,
  });

  if (result.beforeStart) {
    throw new ApiError(400, 'Ese mes es anterior al arranque de la academia');
  }

  // Lo omitido se cuenta aparte segun el motivo: no es lo mismo "ya la tenia"
  // que "todavia no estudiaba aqui ese mes".
  const detail = [`${result.skipped} ya emitidas`];
  if (result.tooEarly > 0) detail.push(`${result.tooEarly} de alta posterior`);

  res.status(201).json({
    success: true,
    message: `Se generaron ${result.created} mensualidades (${detail.join(', ')})`,
    data: result,
  });
});

module.exports = {
  ...crud,
  settle,
  voidPayment,
  restorePayment,
  summary,
  generateMonthly,
  nextReceiptNumber,
  receiptFor,
};
