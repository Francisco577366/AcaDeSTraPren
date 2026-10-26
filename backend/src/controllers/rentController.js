const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { round2 } = require('../utils/money');
const { todayLocal, currentPeriod } = require('../utils/today');
const env = require('../config/env');
const { updateRecord } = require('../utils/persist');
const { createCrudController } = require('./crudFactory');
const { peekNextId } = require('../models/plugins/autoIncrement');
const { RentPayment } = require('../models');

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function serialize(row) {
  if (!row) return row;
  const data = row.toJSON ? row.toJSON() : row;
  data.balance = row.getBalance ? row.getBalance() : 0;
  if (data.periodMonth) {
    data.periodLabel = `${MONTHS[data.periodMonth - 1]} ${data.periodYear || ''}`.trim();
  }
  return data;
}

const receiptFor = (id) => `ALQ-${String(id).padStart(6, '0')}`;

async function beforeWrite(body, req, existing) {
  if (!existing && !body.receiptNumber) {
    body.receiptNumber = receiptFor(await peekNextId(RentPayment.collection.name));
  }
  if (!existing && !body.registeredById && req.user) body.registeredById = req.user.id;
  if (body.status && body.status !== 'anulado') delete body.status;
  return body;
}

const crud = createCrudController({
  model: RentPayment,
  name: 'Alquiler',
  searchFields: ['concept', 'receiptNumber', 'reference', 'landlord'],
  filterFields: ['status', 'method', 'currency', 'periodMonth', 'periodYear'],
  dateField: 'paymentDate',
  order: { periodYear: -1, periodMonth: -1, id: -1 },
  serialize,
  beforeWrite,
});

/** Abona parcial o totalmente el alquiler de un periodo. */
const settle = asyncHandler(async (req, res) => {
  const item = await RentPayment.findOne({ id: Number(req.params.id) });
  if (!item) throw ApiError.notFound('Alquiler no encontrado');
  if (item.status === 'anulado') throw ApiError.badRequest('El recibo esta anulado');

  const amount = Number(req.body.amount || 0);
  if (amount <= 0) throw ApiError.badRequest('El monto del abono debe ser mayor a cero');

  const balance = item.getBalance();
  if (amount > balance + 0.009) {
    throw ApiError.badRequest(`El abono excede el saldo pendiente (${balance.toFixed(2)})`);
  }

  await updateRecord(item, {
    paidAmount: round2(Number(item.paidAmount || 0) + amount),
    paymentDate: req.body.paymentDate || todayLocal(),
    method: req.body.method || item.method,
    reference: req.body.reference || item.reference,
  });

  res.json({
    success: true,
    data: serialize(await RentPayment.findOne({ id: item.id })),
    message: 'Pago registrado',
  });
});

const voidPayment = asyncHandler(async (req, res) => {
  const item = await RentPayment.findOne({ id: Number(req.params.id) });
  if (!item) throw ApiError.notFound('Alquiler no encontrado');

  await updateRecord(item, {
    status: 'anulado',
    notes: [item.notes, `Anulado: ${req.body.reason || 'sin motivo indicado'}`]
      .filter(Boolean)
      .join(' | '),
  });

  res.json({
    success: true,
    data: serialize(await RentPayment.findOne({ id: item.id })),
    message: 'Recibo anulado',
  });
});

/** Totales del anio: cuanto se pago de alquiler y cuanto queda debiendo. */
const summary = asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || currentPeriod().year;

  // El alquiler puede pactarse en dolares o en bolivares, asi que todo se
  // agrupa tambien por moneda: sumarlas juntas daria una cifra sin sentido.
  const [byStatus, byMonth] = await Promise.all([
    RentPayment.aggregate([
      { $match: { periodYear: year } },
      {
        $group: {
          _id: { status: '$status', currency: '$currency' },
          count: { $sum: 1 },
          total: { $sum: '$amount' },
          paid: { $sum: '$paidAmount' },
        },
      },
      { $sort: { '_id.status': 1, '_id.currency': 1 } },
    ]),
    RentPayment.aggregate([
      { $match: { status: { $ne: 'anulado' }, periodYear: year } },
      {
        $group: {
          _id: { month: '$periodMonth', currency: '$currency' },
          total: { $sum: '$amount' },
          paid: { $sum: '$paidAmount' },
        },
      },
      { $sort: { '_id.month': 1 } },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      year,
      byStatus: byStatus.map((r) => ({
        status: r._id.status,
        currency: r._id.currency,
        count: r.count,
        total: round2(r.total),
        paid: round2(r.paid),
        balance: round2(Number(r.total || 0) - Number(r.paid || 0)),
      })),
      byMonth: byMonth.map((r) => ({
        month: Number(r._id.month),
        label: MONTHS[Number(r._id.month) - 1],
        currency: r._id.currency,
        total: round2(r.total),
        paid: round2(r.paid),
      })),
    },
  });
});

/**
 * Emite el recibo del alquiler del periodo con el monto habitual, para no
 * escribirlo a mano todos los meses. No pisa uno ya emitido.
 */
const generate = asyncHandler(async (req, res) => {
  const now = new Date();
  const month = Number(req.body.month) || currentPeriod().month;
  const year = Number(req.body.year) || currentPeriod().year;
  const amount = round2(req.body.amount ?? env.baseRent);
  const currency = req.body.currency || env.rentCurrency;

  if (amount <= 0) {
    throw ApiError.badRequest(
      'No hay monto de alquiler. Indicalo aqui o fija BASE_RENT en la configuracion.'
    );
  }

  const exists = await RentPayment.findOne({
    periodMonth: month, periodYear: year, status: { $ne: 'anulado' },
  });
  if (exists) {
    throw ApiError.conflict(`Ya existe el alquiler de ${MONTHS[month - 1]} ${year}`);
  }

  const dueDay = Math.min(28, Math.max(1, Number(req.body.dueDay) || env.rentDueDay));
  const item = await RentPayment.create({
    receiptNumber: receiptFor(await peekNextId(RentPayment.collection.name)),
    concept: `Alquiler ${MONTHS[month - 1]} ${year}`,
    landlord: req.body.landlord || null,
    amount,
    currency,
    periodMonth: month,
    periodYear: year,
    dueDate: `${year}-${String(month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`,
    registeredById: req.user ? req.user.id : null,
  });

  res.status(201).json({
    success: true,
    data: serialize(item),
    message: `Alquiler de ${MONTHS[month - 1]} ${year} emitido`,
  });
});

module.exports = { ...crud, settle, voidPayment, summary, generate };
