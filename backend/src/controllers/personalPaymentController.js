const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { currentPeriod } = require('../utils/today');
const { round2 } = require('../utils/money');
const { createCrudController } = require('./crudFactory');
const { peekNextId } = require('../models/plugins/autoIncrement');
const { PersonalPayment } = require('../models');

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const receiptFor = (id) => `PER-${String(id).padStart(6, '0')}`;

async function beforeWrite(body, req, existing) {
  if (!existing && !body.receiptNumber) {
    body.receiptNumber = receiptFor(await peekNextId(PersonalPayment.collection.name));
  }
  if (!existing && !body.registeredById && req.user) body.registeredById = req.user.id;
  return body;
}

const crud = createCrudController({
  model: PersonalPayment,
  name: 'Pago personal',
  searchFields: ['concept', 'receiptNumber', 'reference', 'notes'],
  filterFields: ['category', 'method', 'currency'],
  dateField: 'paymentDate',
  order: { paymentDate: -1, id: -1 },
  beforeWrite,
});

/** Cuanto se ha retirado: del anio, del mes y repartido por categoria. */
const summary = asyncHandler(async (req, res) => {
  const now = new Date();
  const year = Number(req.query.year) || currentPeriod().year;
  const month = Number(req.query.month) || currentPeriod().month;

  /*
   * La fecha es texto aaaa-mm-dd, asi que el anio y el mes se sacan del
   * propio texto: un rango para filtrar y una porcion para agrupar. Sale mas
   * barato que convertir cada fila a fecha, y de paso evita que la zona
   * horaria del servidor mueva un retiro de mes.
   */
  const delAnio = { paymentDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } };
  const mm = String(month).padStart(2, '0');
  const delMes = { paymentDate: { $gte: `${year}-${mm}-01`, $lte: `${year}-${mm}-31` } };
  const MES = { $toInt: { $substr: ['$paymentDate', 5, 2] } };

  const [byMonth, byCategory, byCurrency] = await Promise.all([
    PersonalPayment.aggregate([
      { $match: delAnio },
      {
        $group: {
          _id: { month: MES, currency: '$currency' },
          count: { $sum: 1 },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.month': 1 } },
    ]),
    PersonalPayment.aggregate([
      { $match: delAnio },
      {
        $group: {
          _id: { category: '$category', currency: '$currency' },
          count: { $sum: 1 },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.category': 1 } },
    ]),
    PersonalPayment.aggregate([
      { $match: delMes },
      { $group: { _id: '$currency', count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      period: { year, month, label: `${MONTHS[month - 1]} ${year}` },
      month: byCurrency.map((r) => ({
        currency: r._id,
        count: Number(r.count),
        total: round2(r.total),
      })),
      byMonth: byMonth.map((r) => ({
        month: Number(r._id.month),
        label: MONTHS[Number(r._id.month) - 1],
        currency: r._id.currency,
        count: r.count,
        total: round2(r.total),
      })),
      byCategory: byCategory.map((r) => ({
        category: r._id.category,
        currency: r._id.currency,
        count: r.count,
        total: round2(r.total),
      })),
    },
  });
});

/**
 * Lo que se retiro el mes anterior al periodo pedido, para proponer su
 * renovacion. Casi todos los meses se repiten los mismos gastos, pero no
 * todos: por eso se listan y se elige cuales van.
 */
const previous = asyncHandler(async (req, res) => {
  const { year, month } = currentPeriod();
  const targetMonth = Number(req.query.month) || month;
  const targetYear = Number(req.query.year) || year;

  const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1;
  const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear;

  // Todas las fechas de un mes empiezan por aaaa-mm, asi que basta el prefijo.
  const delMes = (a, m) => ({ paymentDate: { $regex: `^${a}-${String(m).padStart(2, '0')}-` } });

  const items = await PersonalPayment.find(delMes(prevYear, prevMonth))
    .sort({ paymentDate: 1, id: 1 });

  // Lo ya renovado no se vuelve a proponer: se compara por concepto.
  const yaEste = await PersonalPayment.find(delMes(targetYear, targetMonth))
    .select('concept').lean();
  const repetidos = new Set(yaEste.map((r) => r.concept.trim().toLowerCase()));

  res.json({
    success: true,
    data: {
      from: { month: prevMonth, year: prevYear, label: `${MONTHS[prevMonth - 1]} ${prevYear}` },
      to: { month: targetMonth, year: targetYear, label: `${MONTHS[targetMonth - 1]} ${targetYear}` },
      items: items.map((p) => ({
        id: p.id,
        concept: p.concept,
        category: p.category,
        amount: round2(p.amount),
        currency: p.currency,
        method: p.method,
        paymentDate: p.paymentDate,
        alreadyRenewed: repetidos.has(String(p.concept).trim().toLowerCase()),
      })),
    },
  });
});

/** Copia al periodo indicado los retiros elegidos del mes anterior. */
const renew = asyncHandler(async (req, res) => {
  const { year, month } = currentPeriod();
  const targetMonth = Number(req.body.month) || month;
  const targetYear = Number(req.body.year) || year;

  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) throw ApiError.badRequest('Elige al menos un pago para renovar');

  const origen = await PersonalPayment.find({ id: { $in: ids } });
  if (!origen.length) throw ApiError.badRequest('No se encontraron los pagos indicados');

  // Se conserva el dia del mes original; si ese dia no existe, el ultimo.
  const diasDelMes = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const creados = [];

  for (const p of origen) {
    const dia = Math.min(Number(String(p.paymentDate).slice(8, 10)) || 1, diasDelMes);

    const nuevo = await PersonalPayment.create({
      receiptNumber: receiptFor(await peekNextId(PersonalPayment.collection.name)),
      concept: p.concept,
      category: p.category,
      amount: p.amount,
      currency: p.currency,
      method: p.method,
      notes: p.notes,
      paymentDate: `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
      registeredById: req.user ? req.user.id : null,
    });

    creados.push(nuevo.receiptNumber);
  }

  res.status(201).json({
    success: true,
    data: { created: creados.length, receipts: creados, period: { month: targetMonth, year: targetYear } },
    message: `Se renovaron ${creados.length} pago(s) en ${MONTHS[targetMonth - 1]} ${targetYear}`,
  });
});

module.exports = { ...crud, summary, previous, renew };
