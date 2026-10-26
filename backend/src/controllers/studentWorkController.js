const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { round2 } = require('../utils/money');
const { todayLocal } = require('../utils/today');
const { updateRecord } = require('../utils/persist');
const { createCrudController } = require('./crudFactory');
const { peekNextId } = require('../models/plugins/autoIncrement');
const { StudentWork, Student, Teacher, Payment } = require('../models');

const populate = [
  { modelo: 'Student', campo: 'studentId', como: 'student', campos: 'id firstName lastName', nombreEn: 'studentName' },
  { modelo: 'Teacher', campo: 'teacherId', como: 'teacher', campos: 'id firstName lastName', nombreEn: 'teacherName' },
];

function serialize(row) {
  if (!row) return row;
  const data = row.toJSON ? row.toJSON() : row;
  data.totalCost = row.getTotalCost ? row.getTotalCost() : 0;
  data.margin = row.getMargin ? row.getMargin() : 0;
  data.balance = row.getBalance ? row.getBalance() : 0;
  // studentName y teacherName los compone la fabrica al adjuntar.
  return data;
}

async function nextCode() {
  const siguiente = await peekNextId(StudentWork.collection.name);
  return `TRB-${String(siguiente).padStart(6, '0')}`;
}

async function beforeWrite(body, req, existing) {
  if (!existing && !body.code) body.code = await nextCode();
  // paymentStatus lo calcula el modelo a partir de price/paidAmount.
  delete body.paymentStatus;
  return body;
}

const crud = createCrudController({
  model: StudentWork,
  name: 'Trabajo',
  searchFields: ['title', 'description', 'code'],
  filterFields: ['status', 'paymentStatus', 'category', 'studentId', 'teacherId'],
  dateField: 'assignedDate',
  populate,
  order: { assignedDate: -1, id: -1 },
  cascade: 'StudentWork',
  serialize,
  beforeWrite,
});

/**
 * Emite el cobro del trabajo indicado a nombre del alumno.
 * Deja el pago enlazado para que ambos registros queden conciliados.
 */
const invoice = asyncHandler(async (req, res) => {
  const work = await StudentWork.findOne({ id: Number(req.params.id) });
  if (!work) throw ApiError.notFound('Trabajo no encontrado');
  if (Number(work.price) <= 0) {
    throw ApiError.badRequest('El trabajo no tiene un precio asignado para cobrar');
  }

  const already = await Payment.findOne({ studentWorkId: work.id, status: { $ne: 'anulado' } });
  if (already) throw ApiError.conflict('Este trabajo ya tiene un cobro emitido');

  const payment = await Payment.create({
    receiptNumber: `REC-${String(await peekNextId(Payment.collection.name)).padStart(6, '0')}`,
    studentId: work.studentId,
    studentWorkId: work.id,
    concept: `Trabajo: ${work.title}`,
    conceptType: 'trabajo',
    amount: work.price,
    paidAmount: work.paidAmount,
    dueDate: req.body.dueDate || work.dueDate,
    registeredById: req.user ? req.user.id : null,
    notes: req.body.notes || null,
  });

  res.status(201).json({
    success: true,
    data: payment,
    message: 'Cobro emitido y enlazado al trabajo',
  });
});

/** Registra un abono directamente sobre el trabajo. */
const settle = asyncHandler(async (req, res) => {
  const work = await StudentWork.findOne({ id: Number(req.params.id) });
  if (!work) throw ApiError.notFound('Trabajo no encontrado');

  const amount = Number(req.body.amount || 0);
  if (amount <= 0) throw ApiError.badRequest('El monto del abono debe ser mayor a cero');

  const balance = work.getBalance();
  if (amount > balance + 0.009) {
    throw ApiError.badRequest(`El abono excede el saldo pendiente (${balance.toFixed(2)})`);
  }

  await updateRecord(work, { paidAmount: round2(Number(work.paidAmount || 0) + amount) });

  // Si el trabajo ya tiene un cobro asociado, lo mantenemos sincronizado.
  // La fecha de pago es la que hace que el abono entre en la caja del mes.
  const linked = await Payment.findOne({ studentWorkId: work.id, status: { $ne: 'anulado' } });
  if (linked) {
    await updateRecord(linked, {
      paidAmount: work.paidAmount,
      paymentDate: linked.paymentDate || todayLocal(),
    });
  }

  const fresh = await StudentWork.findOne({ id: work.id });
  res.json({ success: true, data: serialize(fresh), message: 'Abono registrado' });
});

/** Indicadores de costo, facturacion y margen de los trabajos. */
const summary = asyncHandler(async (req, res) => {
  const [totalsRows, byStatus, byPaymentStatus, byCategory] = await Promise.all([
    StudentWork.aggregate([
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          materialCost: { $sum: '$materialCost' },
          laborCost: { $sum: '$laborCost' },
          price: { $sum: '$price' },
          paid: { $sum: '$paidAmount' },
        },
      },
    ]),
    StudentWork.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    StudentWork.aggregate([
      {
        $group: {
          _id: '$paymentStatus',
          count: { $sum: 1 },
          price: { $sum: '$price' },
          paid: { $sum: '$paidAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    StudentWork.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          cost: { $sum: { $add: ['$materialCost', '$laborCost'] } },
          price: { $sum: '$price' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const totals = totalsRows[0] || {};
  const cost = round2(Number(totals.materialCost || 0) + Number(totals.laborCost || 0));
  const price = round2(totals.price);
  const paid = round2(totals.paid);

  res.json({
    success: true,
    data: {
      totals: {
        count: Number(totals.count || 0),
        materialCost: round2(totals.materialCost),
        laborCost: round2(totals.laborCost),
        totalCost: cost,
        billed: price,
        paid,
        pending: round2(price - paid),
        margin: round2(price - cost),
        marginPercent: price > 0 ? round2(((price - cost) / price) * 100) : 0,
      },
      byStatus: byStatus.map((r) => ({ status: r._id, count: r.count })),
      byPaymentStatus: byPaymentStatus.map((r) => ({
        paymentStatus: r._id,
        count: r.count,
        price: round2(r.price),
        paid: round2(r.paid),
      })),
      byCategory: byCategory.map((r) => ({
        category: r._id,
        count: r.count,
        cost: round2(r.cost),
        price: round2(r.price),
        margin: round2(Number(r.price || 0) - Number(r.cost || 0)),
      })),
    },
  });
});

module.exports = { ...crud, invoice, settle, summary };
