const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { round2 } = require('../utils/money');
const { todayLocal, currentPeriod } = require('../utils/today');
const env = require('../config/env');
const { updateRecord } = require('../utils/persist');
const { weeksForPeriod } = require('../utils/payroll');
const { createCrudController } = require('./crudFactory');
const { peekNextId } = require('../models/plugins/autoIncrement');
const { conFiltro } = require('../models/plugins/demo');

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Construye el controlador de una nomina, la docente o la de libreria.
 *
 * Eran dos ficheros de 260 lineas que solo se diferenciaban en el nombre de
 * la persona, el prefijo del recibo y de donde sale el pago semanal. El panel
 * ya suma las dos como si fueran una, asi que tenerlas aqui garantiza que no
 * puedan separarse: un cambio en la regla del abono o en la de generar el
 * periodo entra en las dos a la vez.
 *
 * @param {object} cfg
 * @param {import('mongoose').Model} cfg.Pago      Modelo del recibo.
 * @param {import('mongoose').Model} cfg.Persona   Modelo de quien cobra.
 * @param {string}   cfg.personaId                 Campo que apunta a la persona.
 * @param {string}   cfg.personaComo               Como se llama al adjuntarla.
 * @param {string}   cfg.prefijo                   Prefijo del recibo (NOM-, LIB-).
 * @param {string}   cfg.nombre                    Nombre legible para los errores.
 * @param {string}   cfg.conceptoNomina            Texto del concepto al generar.
 * @param {string[]} cfg.camposPersona             Campos de la persona que se adjuntan.
 * @param {object}   [cfg.filtroPersonas]          A quien se le genera la nomina.
 * @param {Function} cfg.pagoSemanalDe             De donde sale su pago semanal.
 */
function createPayrollController(cfg) {
  const {
    Pago, Persona, personaId, personaComo, prefijo, nombre,
    conceptoNomina, camposPersona, filtroPersonas = { status: 'activo' },
    pagoSemanalDe,
  } = cfg;

  const coleccion = Pago.collection.name;
  const receiptFor = (id) => `${prefijo}${String(id).padStart(6, '0')}`;

  const populate = [{
    modelo: Persona.modelName,
    campo: personaId,
    como: personaComo,
    campos: camposPersona.join(' '),
    nombreEn: `${personaComo}Name`,
  }];

  function serialize(row) {
    if (!row) return row;
    const data = row.toJSON ? row.toJSON() : row;
    data.total = row.getTotal ? row.getTotal() : 0;
    data.balance = row.getBalance ? row.getBalance() : 0;
    if (data.periodMonth) {
      data.periodLabel = `${MONTHS[data.periodMonth - 1]} ${data.periodYear || ''}`.trim();
    }
    // Como se llego al monto, para mostrarlo en el listado sin recalcular.
    if (Number(data.weeks) > 0 && Number(data.weeklyRate) > 0) {
      data.basis = `${data.weeks} sem x ${data.weeklyRate}`;
    } else if (Number(data.hours) > 0 && Number(data.rate) > 0) {
      data.basis = `${data.hours} h x ${data.rate}`;
    }
    return data;
  }

  async function beforeWrite(body, req, existing) {
    if (!existing && !body.receiptNumber) {
      body.receiptNumber = receiptFor(await peekNextId(coleccion));
    }
    // El estado lo recalcula el modelo; solo respetamos la anulacion explicita.
    if (body.status && body.status !== 'anulado') delete body.status;
    return body;
  }

  const crud = createCrudController({
    model: Pago,
    name: nombre,
    searchFields: ['concept', 'receiptNumber', 'reference'],
    filterFields: ['status', 'conceptType', 'method', personaId, 'periodMonth', 'periodYear'],
    dateField: 'paymentDate',
    populate,
    order: { id: -1 },
    serialize,
    beforeWrite,
  });

  /** Devuelve el recibo ya con la persona adjunta y el nombre compuesto. */
  async function recargar(id) {
    const fresco = await Pago.findOne({ id });
    const [fila] = await crud.adjuntar([serialize(fresco)]);
    return fila;
  }

  /** Abona parcial o totalmente un recibo de nomina. */
  const settle = asyncHandler(async (req, res) => {
    const item = await Pago.findOne({ id: Number(req.params.id) });
    if (!item) throw ApiError.notFound('Pago no encontrado');
    if (item.status === 'anulado') throw ApiError.badRequest('El pago esta anulado');

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

    res.json({ success: true, data: await recargar(item.id), message: 'Abono registrado' });
  });

  const voidPayment = asyncHandler(async (req, res) => {
    const item = await Pago.findOne({ id: Number(req.params.id) });
    if (!item) throw ApiError.notFound('Pago no encontrado');

    await updateRecord(item, {
      status: 'anulado',
      notes: [item.notes, `Anulado: ${req.body.reason || 'sin motivo indicado'}`]
        .filter(Boolean)
        .join(' | '),
    });

    res.json({ success: true, data: await recargar(item.id), message: 'Pago anulado' });
  });

  /** Resumen de nomina del anio consultado. */
  const summary = asyncHandler(async (req, res) => {
    const year = Number(req.query.year) || currentPeriod().year;
    // El neto de un recibo: monto mas bono menos deducciones.
    const NETO = { $subtract: [{ $add: ['$amount', '$bonus'] }, '$deductions'] };

    const [byStatus, byPersona, byMonth] = await Promise.all([
      Pago.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: NETO }, paid: { $sum: '$paidAmount' } } },
        { $sort: { _id: 1 } },
      ]),
      Pago.aggregate([
        { $match: { status: { $ne: 'anulado' }, periodYear: year } },
        { $group: { _id: `$${personaId}`, count: { $sum: 1 }, total: { $sum: NETO }, paid: { $sum: '$paidAmount' } } },
        // El nombre vive en otra coleccion: se trae aqui en vez de con una
        // consulta por persona.
        {
          /*
           * Forma con pipeline y no con localField: es la unica que admite un
           * $match, y aqui hace falta para que la academia y el cajon de
           * pruebas no se crucen los nombres. El sub-pipeline de un $lookup
           * no pasa por los hooks del modelo.
           */
          $lookup: {
            from: Persona.collection.name,
            let: { persona: '$_id' },
            pipeline: [{ $match: conFiltro({ $expr: { $eq: ['$id', '$$persona'] } }) }],
            as: 'persona',
          },
        },
        { $unwind: { path: '$persona', preserveNullAndEmptyArrays: true } },
        { $sort: { paid: -1 } },
      ]),
      Pago.aggregate([
        { $match: { status: { $ne: 'anulado' }, periodYear: year } },
        { $group: { _id: '$periodMonth', paid: { $sum: '$paidAmount' }, total: { $sum: NETO } } },
      ]),
    ]);

    const nombreDe = (p) => (p ? `${p.firstName} ${p.lastName || ''}`.trim() : null);

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
        [`by${personaComo.charAt(0).toUpperCase()}${personaComo.slice(1)}`]: byPersona.map((r) => ({
          [`${personaComo}Id`]: r._id,
          [`${personaComo}Name`]: nombreDe(r.persona),
          count: r.count,
          total: round2(r.total),
          paid: round2(r.paid),
          balance: round2(Number(r.total || 0) - Number(r.paid || 0)),
        })),
        byMonth: Array.from({ length: 12 }, (_, i) => {
          const found = byMonth.find((r) => Number(r._id) === i + 1);
          return {
            month: i + 1,
            label: MONTHS[i],
            paid: found ? round2(found.paid) : 0,
            total: found ? round2(found.total) : 0,
          };
        }),
      },
    });
  });

  /**
   * Prepara la nomina del periodo. El monto sale de las semanas que cubre el
   * recibo por el pago semanal de cada persona, asi que un mes arrancado a
   * mitad se emite con las semanas que realmente se trabajaron.
   */
  const generatePayroll = asyncHandler(async (req, res) => {
    const month = Number(req.body.month) || currentPeriod().month;
    const year = Number(req.body.year) || currentPeriod().year;
    // Sin semanas explicitas se usan las del periodo: el mes completo, salvo
    // el de arranque de la academia, que solo paga lo que se trabajo.
    const weeks = Number(req.body.weeks) > 0 ? Number(req.body.weeks) : weeksForPeriod(month, year);
    if (weeks <= 0) {
      throw ApiError.badRequest(
        `El periodo ${MONTHS[month - 1]} ${year} es anterior al inicio de la academia (${env.academyStartDate})`
      );
    }

    const personas = await Persona.find(filtroPersonas);

    // Quien ya tiene el recibo del periodo, en una sola consulta.
    const emitidos = await Pago.find({
      periodMonth: month,
      periodYear: year,
      conceptType: 'salario',
      status: { $ne: 'anulado' },
    }).select(personaId).lean();
    const yaTiene = new Set(emitidos.map((e) => e[personaId]));

    let created = 0;
    let skipped = 0;

    for (const persona of personas) {
      const weeklyRate = round2(pagoSemanalDe(persona));
      if (weeklyRate <= 0 || yaTiene.has(persona.id)) {
        skipped += 1;
        continue;
      }

      await Pago.create({
        receiptNumber: receiptFor(await peekNextId(coleccion)),
        [personaId]: persona.id,
        concept: `${conceptoNomina} ${MONTHS[month - 1]} ${year} (${weeks} semana${weeks === 1 ? '' : 's'})`,
        conceptType: 'salario',
        weeks,
        weeklyRate,
        periodMonth: month,
        periodYear: year,
        dueDate: `${year}-${String(month).padStart(2, '0')}-28`,
        registeredById: req.user ? req.user.id : null,
      });

      created += 1;
    }

    res.status(201).json({
      success: true,
      message: `Se generaron ${created} recibos de nomina de ${weeks} semana${weeks === 1 ? '' : 's'} (${skipped} omitidos)`,
      data: { created, skipped, weeks, period: { month, year } },
    });
  });

  return { ...crud, settle, voidPayment, summary, generatePayroll, receiptFor, serialize };
}

module.exports = { createPayrollController, MONTHS };
