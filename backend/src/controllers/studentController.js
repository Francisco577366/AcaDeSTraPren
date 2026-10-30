const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { round2 } = require('../utils/money');
const { todayLocal, currentPeriod } = require('../utils/today');
const { updateRecord } = require('../utils/persist');
const { getPagination, buildPage } = require('../utils/pagination');
const env = require('../config/env');
const { createCrudController } = require('./crudFactory');
const { mongoose } = require('../models');
const { peekNextId } = require('../models/plugins/autoIncrement');
const { Student, StudentWork, Payment } = require('../models');
const { conFiltro } = require('../models/plugins/demo');

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** El apellido es opcional, asi que el nombre completo se arma con cuidado. */
const fullNameOf = (row) => `${row.firstName} ${row.lastName || ''}`.trim();

function serialize(row) {
  if (!row) return row;
  const data = row.toJSON ? row.toJSON() : row;
  data.fullName = fullNameOf(data);
  return data;
}

const crud = createCrudController({
  model: Student,
  name: 'Alumno',
  searchFields: ['firstName', 'lastName', 'documentId', 'grade'],
  filterFields: ['status'],
  order: { firstName: 1, lastName: 1 },
  serialize,
});

/**
 * Alta del alumno emitiendo de una vez los cobros que correspondan.
 *
 * Un alumno recien registrado casi nunca esta al dia: lo normal es que entre
 * debiendo la mensualidad y, si aplica, la inscripcion. Como el listado calcula
 * la deuda a partir de los cobros abiertos, sin emitirlos aparecia "Al dia"
 * aunque no hubiera pagado nada. Por eso el formulario pregunta por los dos.
 */
const create = asyncHandler(async (req, res) => {
  const {
    monthlyCharge = 'pendiente',
    enrollmentCharge = 'ninguno',
    enrollmentFee = 0,
    ...data
  } = req.body;

  const now = new Date();
  const { month, year } = currentPeriod();
  const period = `${year}-${String(month).padStart(2, '0')}`;

  /*
   * El alta y sus primeros cobros van juntos: un alumno creado sin su
   * mensualidad apareceria "al dia" sin haber pagado nada.
   */
  const sesion = await mongoose.startSession();
  let student;
  try {
    await sesion.withTransaction(async () => {
      const [row] = await Student.create(
        [{ ...data, registeredById: req.user ? req.user.id : null }],
        { session: sesion }
      );

      /** Emite un cobro y lo deja pagado si asi se indico en el alta. */
      const charge = async ({ concept, conceptType, amount, dueDate, paid }) => {
        await Payment.create(
          [{
            receiptNumber: `REC-${String(await peekNextId(Payment.collection.name)).padStart(6, '0')}`,
            studentId: row.id,
            concept,
            conceptType,
            amount,
            paidAmount: paid ? amount : 0,
            periodMonth: month,
            periodYear: year,
            dueDate,
            method: 'efectivo',
            registeredById: req.user ? req.user.id : null,
          }],
          { session: sesion }
        );
      };

      const fee = round2(row.monthlyFee);
      if (monthlyCharge !== 'ninguno' && fee > 0) {
        await charge({
          concept: `Mensualidad ${MONTHS[month - 1]} ${year} - ${row.getFullName()}`,
          conceptType: 'mensualidad',
          amount: fee,
          dueDate: `${period}-${String(env.monthlyDueDay).padStart(2, '0')}`,
          paid: monthlyCharge === 'pagado',
        });
      }

      const inscription = round2(enrollmentFee);
      if (enrollmentCharge !== 'ninguno' && inscription > 0) {
        await charge({
          concept: `Inscripcion - ${row.getFullName()}`,
          conceptType: 'inscripcion',
          amount: inscription,
          dueDate: todayLocal(now),
          paid: enrollmentCharge === 'pagado',
        });
      }

      student = row;
    });
  } finally {
    await sesion.endSession();
  }

  const fresh = await Student.findOne({ id: student.id });
  res.status(201).json({ success: true, data: serialize(fresh), message: 'Alumno creado' });
});

/**
 * Saldo abierto de un grupo de alumnos, en una sola consulta. Se usa para
 * que el listado pueda mostrar de un vistazo quien esta al dia y quien debe.
 */
async function balancesFor(studentIds, period) {
  if (!studentIds.length) return new Map();

  // Con un periodo, el estado es el DE ESE MES: cuanto se le facturo, cuanto
  // abono y que le falta. Sin periodo, todo lo que tenga abierto.
  const porPeriodo = Boolean(period && period.month && period.year);
  const estados = porPeriodo
    ? ['pendiente', 'parcial', 'vencido', 'pagado']
    : ['pendiente', 'parcial', 'vencido'];

  const rows = await Payment.aggregate([
    {
      $match: {
        status: { $in: estados },
        studentId: { $in: studentIds },
        ...(porPeriodo ? { periodMonth: period.month, periodYear: period.year } : {}),
      },
    },
    {
      $group: {
        _id: '$studentId',
        pendingCount: { $sum: 1 },
        balance: { $sum: Payment.SALDO },
        // Solo la parte vencida, que es la que avisa de un retraso real.
        overdue: {
          $sum: { $cond: [{ $eq: ['$status', 'vencido'] }, Payment.SALDO, 0] },
        },
        paidOpen: { $sum: '$paidAmount' },
        billed: { $sum: Payment.TOTAL },
      },
    },
  ]);

  return new Map(
    rows.map((r) => [
      Number(r._id),
      {
        pendingCount: r.pendingCount,
        balance: round2(r.balance),
        overdue: round2(r.overdue),
        paidOpen: round2(r.paidOpen),
        billed: round2(r.billed),
      },
    ])
  );
}

/** Los tres estados de cobranza en que puede estar un alumno. */
const PAYMENT_STATES = ['al_dia', 'pendiente', 'parcial', 'sin_emitir', 'con_deuda'];

/**
 * En que estado de cobranza esta el alumno:
 *   al_dia    no debe nada abierto
 *   parcial   debe, pero ya abono algo
 *   pendiente debe y no ha entregado nada
 */
function paymentStateOf(balance) {
  if (!balance || balance.balance <= 0) return 'al_dia';
  return balance.paidOpen > 0 ? 'parcial' : 'pendiente';
}

/**
 * Ids de los alumnos que estan en un estado de cobranza dado. Se resuelve
 * aparte del listado porque el estado no vive en la tabla de alumnos: sale de
 * sus cobros abiertos, y filtrar despues de paginar daria paginas incompletas.
 */
async function idsInPaymentState(state, period) {
  const porPeriodo = Boolean(period && period.month && period.year);

  // Misma regla que balancesFor, si no el filtro y la etiqueta de cada fila
  // podrian contradecirse: con periodo entran tambien los recibos pagados.
  const estados = porPeriodo
    ? ['pendiente', 'parcial', 'vencido', 'pagado']
    : ['pendiente', 'parcial', 'vencido'];

  const rows = await Payment.aggregate([
    {
      $match: {
        status: { $in: estados },
        ...(porPeriodo ? { periodMonth: period.month, periodYear: period.year } : {}),
      },
    },
    {
      $group: {
        _id: '$studentId',
        balance: { $sum: Payment.SALDO },
        paidOpen: { $sum: '$paidAmount' },
      },
    },
  ]);

  const conRecibo = rows.map((r) => ({
    id: Number(r._id),
    balance: Number(r.balance || 0),
    paid: Number(r.paidOpen || 0),
  }));

  // Sin recibo emitido en el mes no se puede decir que este al dia.
  if (state === 'sin_emitir') {
    return porPeriodo ? { $nin: conRecibo.map((r) => r.id) } : { $in: [] };
  }

  if (state === 'al_dia') {
    return porPeriodo
      ? { $in: conRecibo.filter((r) => r.balance <= 0).map((r) => r.id) }
      : { $nin: conRecibo.map((r) => r.id) };
  }

  // 'con_deuda' es el cajon de los que deben algo, hayan abonado o no: es lo
  // que se quiere ver al preguntar "quien falta por pagar".
  if (state === 'con_deuda') {
    return { $in: conRecibo.filter((r) => r.balance > 0).map((r) => r.id) };
  }

  const wantsPartial = state === 'parcial';
  return {
    $in: conRecibo
      .filter((r) => r.balance > 0 && (r.paid > 0) === wantsPartial)
      .map((r) => r.id),
  };
}

/**
 * Listado con el estado de cobranza de cada alumno: reutiliza los filtros y
 * el orden de la fabrica, y agrega el saldo con una consulta extra.
 */
const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);

  // Con mes y anio, el listado responde "como va cada alumno ESE mes"; sin
  // ellos, "cuanto debe en total". El selector de la cabecera manda el periodo.
  const month = Number(req.query.periodMonth) || null;
  const year = Number(req.query.periodYear) || null;
  const period = month && year ? { month, year } : null;

  const where = crud.buildWhere(req.query);
  // El estado de cobranza no es una columna: se resuelve contra los cobros.
  if (PAYMENT_STATES.includes(req.query.paymentState)) {
    where.id = await idsInPaymentState(req.query.paymentState, period);
  }

  const [filas, count] = await Promise.all([
    Student.find(where).sort(crud.parseSort(req.query.sort)).skip(offset).limit(limit),
    Student.countDocuments(where),
  ]);

  const payload = buildPage({ rows: filas, count }, { page, limit });
  const rows = payload.data.map(serialize);
  const balances = await balancesFor(rows.map((s) => s.id), period);

  const vacio = { pendingCount: 0, balance: 0, overdue: 0, paidOpen: 0, billed: 0 };

  payload.data = rows.map((s) => {
    const balance = balances.get(s.id) || vacio;
    return {
      ...s,
      ...balance,
      // Sin cobro emitido en el mes no se puede decir que este al dia.
      paymentState: period && balance.billed === 0 ? 'sin_emitir' : paymentStateOf(balance),
    };
  });

  res.json({ success: true, period, ...payload });
});

/**
 * Ficha del alumno: su estado de cuenta (facturado, abonado, saldo y mora),
 * el historial de cobros y sus trabajos con costo.
 */
const profile = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ id: Number(req.params.id) });
  if (!student) throw ApiError.notFound('Alumno no encontrado');

  const [payments, works] = await Promise.all([
    Payment.find({ studentId: student.id }).sort({ paymentDate: -1, id: -1 }),
    StudentWork.find({ studentId: student.id }).sort({ assignedDate: -1, id: -1 }),
  ]);

  const active = payments.filter((p) => p.status !== 'anulado');
  const billed = round2(active.reduce((a, p) => a + p.getTotal(), 0));
  const paid = round2(active.reduce((a, p) => a + Number(p.paidAmount || 0), 0));
  const overdue = round2(
    active.filter((p) => p.status === 'vencido').reduce((a, p) => a + p.getBalance(), 0)
  );

  const worksBilled = round2(works.reduce((a, w) => a + Number(w.price || 0), 0));
  const worksPaid = round2(works.reduce((a, w) => a + Number(w.paidAmount || 0), 0));

  res.json({
    success: true,
    data: {
      student: serialize(student),
      summary: {
        totalBilled: billed,
        totalPaid: paid,
        balance: round2(billed - paid),
        overdueBalance: overdue,
        paymentsCount: payments.length,
        worksCount: works.length,
        worksCost: round2(works.reduce((a, w) => a + w.getTotalCost(), 0)),
        worksBilled,
        worksPaid,
        worksBalance: round2(worksBilled - worksPaid),
      },
      payments: payments.map((p) => ({
        ...p.toJSON(),
        total: p.getTotal(),
        balance: p.getBalance(),
      })),
      works: works.map((w) => ({
        ...w.toJSON(),
        totalCost: w.getTotalCost(),
        margin: w.getMargin(),
        balance: w.getBalance(),
      })),
    },
  });
});

/**
 * Confirma el pago de un alumno: salda de una vez todos sus cobros
 * abiertos. Sirve para el caso habitual de "vino y pago todo lo que debia".
 * Para abonos parciales estan los pagos uno a uno.
 */
const settleDebt = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ id: Number(req.params.id) });
  if (!student) throw ApiError.notFound('Alumno no encontrado');

  const pending = await Payment
    .find({ studentId: student.id, status: { $in: ['pendiente', 'parcial', 'vencido'] } })
    .sort({ dueDate: 1, id: 1 });

  if (!pending.length) {
    throw ApiError.badRequest('Este alumno no tiene cobros pendientes');
  }

  const paymentDate = req.body.paymentDate || todayLocal();
  const deuda = round2(pending.reduce((a, p) => a + p.getBalance(), 0));

  /*
   * Sin `amount` se salda todo, como hasta ahora. Con `amount` se abona esa
   * cantidad repartiendola entre los cobros mas antiguos primero: asi un pago
   * a medias cae donde toca en vez de obligar a elegir recibo a mano.
   */
  const pedido = req.body.amount === undefined || req.body.amount === null || req.body.amount === ''
    ? deuda
    : round2(req.body.amount);

  if (pedido <= 0) throw ApiError.badRequest('El monto del abono debe ser mayor a cero');
  if (pedido > deuda + 0.009) {
    throw ApiError.badRequest(`El abono excede la deuda del alumno (${deuda.toFixed(2)})`);
  }

  let restante = pedido;
  let tocados = 0;

  // El abono se reparte entre varios recibos: o entra entero o no entra
  // ninguno, para que no quede dinero aplicado a medias.
  const sesion = await mongoose.startSession();
  try {
    await sesion.withTransaction(async () => {
      for (const payment of pending) {
        if (restante <= 0.009) break;

        const saldo = payment.getBalance();
        const aplica = Math.min(saldo, restante);

        await updateRecord(payment, {
          paidAmount: round2(Number(payment.paidAmount || 0) + aplica),
          paymentDate,
          method: req.body.method || payment.method,
          reference: req.body.reference || payment.reference,
        }, { session: sesion });

        restante = round2(restante - aplica);
        tocados += 1;
      }
    });
  } finally {
    await sesion.endSession();
  }

  const completo = pedido >= deuda - 0.009;

  res.json({
    success: true,
    data: {
      studentId: student.id,
      receipts: tocados,
      amount: pedido,
      pending: round2(deuda - pedido),
      paymentDate,
    },
    message: completo
      ? `Se saldaron ${tocados} cobro(s) por ${pedido.toFixed(2)}`
      : `Se abonaron ${pedido.toFixed(2)} a ${tocados} cobro(s); quedan ${(deuda - pedido).toFixed(2)}`,
  });
});

/**
 * Marca cobros concretos del alumno como pagados o como pendientes. Es la
 * forma de corregir el estado a mano: confirmar los que si pagaron y revertir
 * los que se marcaron por error.
 */
const setPaymentStatus = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ id: Number(req.params.id) });
  if (!student) throw ApiError.notFound('Alumno no encontrado');

  const paidIds = (req.body.paid || []).map(Number).filter(Boolean);
  const pendingIds = (req.body.pending || []).map(Number).filter(Boolean);

  if (!paidIds.length && !pendingIds.length) {
    throw ApiError.badRequest('No indicaste ningun cobro que cambiar');
  }

  const payments = await Payment.find({
    studentId: student.id, id: { $in: [...paidIds, ...pendingIds] },
  });

  const today = todayLocal();
  const paymentDate = req.body.paymentDate || today;
  let markedPaid = 0;
  let markedPending = 0;

  const sesion = await mongoose.startSession();
  try {
    await sesion.withTransaction(async () => {
      for (const payment of payments) {
        // Un cobro anulado no cambia de estado por aqui: primero hay que
        // restaurarlo desde el modulo de Pagos.
        if (payment.status === 'anulado') continue;

        if (paidIds.includes(payment.id)) {
          await updateRecord(payment, {
            paidAmount: round2(payment.getTotal()),
            paymentDate,
            method: req.body.method || payment.method,
            reference: req.body.reference || payment.reference,
          }, { session: sesion });
          markedPaid += 1;
        } else {
          await updateRecord(payment, { paidAmount: 0, paymentDate: null }, { session: sesion });
          markedPending += 1;
        }
      }
    });
  } finally {
    await sesion.endSession();
  }

  const parts = [];
  if (markedPaid) parts.push(`${markedPaid} como pagado(s)`);
  if (markedPending) parts.push(`${markedPending} como pendiente(s)`);

  res.json({
    success: true,
    data: { studentId: student.id, markedPaid, markedPending },
    message: `Se marco ${parts.join(' y ')}`,
  });
});

/**
 * Emite la mensualidad de un periodo para un alumno concreto. Sirve para
 * cuando todavia no se ha generado la del mes y hay que cobrarle igual.
 */
const createCharge = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ id: Number(req.params.id) });
  if (!student) throw ApiError.notFound('Alumno no encontrado');

  const now = new Date();
  const month = Number(req.body.month) || currentPeriod().month;
  const year = Number(req.body.year) || currentPeriod().year;
  const amount = round2(req.body.amount ?? student.monthlyFee);

  if (amount <= 0) {
    throw ApiError.badRequest(
      'Este alumno no tiene mensualidad. Asignale una o indica un monto.'
    );
  }

  const exists = await Payment.findOne({
    studentId: student.id,
    periodMonth: month,
    periodYear: year,
    conceptType: 'mensualidad',
    status: { $ne: 'anulado' },
  });
  if (exists) {
    throw ApiError.conflict(`Ya existe la mensualidad de ${MONTHS[month - 1]} ${year}`);
  }

  const dueDay = Math.min(28, Math.max(1, Number(req.body.dueDay) || env.monthlyDueDay));


  const payment = await Payment.create({
    receiptNumber: `REC-${String(await peekNextId(Payment.collection.name)).padStart(6, '0')}`,
    studentId: student.id,
    concept: `Mensualidad ${MONTHS[month - 1]} ${year} - ${student.getFullName()}`,
    conceptType: 'mensualidad',
    amount,
    periodMonth: month,
    periodYear: year,
    dueDate: `${year}-${String(month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`,
    registeredById: req.user ? req.user.id : null,
  });

  res.status(201).json({
    success: true,
    data: payment,
    message: `Mensualidad de ${MONTHS[month - 1]} emitida por ${amount.toFixed(2)}`,
  });
});

/** Lista compacta de alumnos activos para los selects del frontend. */
const options = asyncHandler(async (req, res) => {
  const rows = await Student.find({ status: 'activo' })
    .select('id firstName lastName monthlyFee')
    .sort({ firstName: 1, lastName: 1 })
    .lean();

  res.json({ success: true, data: rows.map((r) => ({ ...r, fullName: fullNameOf(r) })) });
});

/** Alumnos con saldo pendiente, ordenados por deuda: foco de cobranza. */
const debtors = asyncHandler(async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

  /*
   * Se agrupa en la base y no en memoria. Antes se traian todos los recibos
   * abiertos y se sumaban aqui para evitar un GROUP BY sobre columnas
   * calculadas; con un pipeline eso deja de ser un problema, y no hay que
   * cargar la coleccion entera para quedarse con diez filas.
   */
  const rows = await Payment.aggregate([
    { $match: { status: { $in: ['pendiente', 'parcial', 'vencido'] } } },
    {
      $group: {
        _id: '$studentId',
        pendingCount: { $sum: 1 },
        balance: { $sum: Payment.SALDO },
      },
    },
    { $match: { balance: { $gt: 0 } } },
    { $sort: { balance: -1 } },
    { $limit: limit },
    {
      // Con pipeline para poder filtrar: el sub-pipeline de un $lookup no
      // pasa por los hooks del modelo. Es el cruce mas delicado de los seis,
      // porque lo que trae son NOMBRES de alumnos.
      $lookup: {
        from: Student.collection.name,
        let: { alumno: '$_id' },
        pipeline: [{ $match: conFiltro({ $expr: { $eq: ['$id', '$$alumno'] } }) }],
        as: 'alumno',
      },
    },
    { $unwind: '$alumno' },
  ]);

  res.json({
    success: true,
    data: rows.map((r) => ({
      studentId: r._id,
      name: fullNameOf(r.alumno),
      grade: r.alumno.grade,
      pendingCount: r.pendingCount,
      balance: round2(r.balance),
    })),
  });
});

module.exports = {
  ...crud,
  list,
  create,
  profile,
  settleDebt,
  setPaymentStatus,
  createCharge,
  options,
  debtors,
};
