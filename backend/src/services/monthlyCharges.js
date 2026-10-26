/* eslint-disable no-console */
const env = require('../config/env');
const { round2 } = require('../utils/money');
const { currentPeriod } = require('../utils/today');
const { peekNextId } = require('../models/plugins/autoIncrement');
const { Student, Payment } = require('../models');

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const receiptFor = (id) => `REC-${String(id).padStart(6, '0')}`;

/** Compara dos periodos por anio y mes, sin meter dias de por medio. */
const isBefore = (a, b) => a.year < b.year || (a.year === b.year && a.month < b.month);

/** El periodo en que arranco la academia; antes de eso no se cobra nada. */
const startPeriod = () => {
  const [year, month] = String(env.academyStartDate).split('-').map(Number);
  return { year: year || 1970, month: month || 1 };
};

/**
 * Emite la mensualidad de un periodo a todos los alumnos activos que todavia
 * no la tengan.
 *
 * Un alumno activo debe su mes desde que el mes empieza, no desde que se le
 * pasa el recibo: si el cobro no existe, el alumno aparece "al dia" sin haber
 * pagado, que es justo lo contrario de lo que pasa. Asi que el mes arranca con
 * todos en pendiente y van saliendo de ahi a medida que pagan.
 *
 * Es idempotente: salta a quien ya tenga el cobro del periodo, asi que se
 * puede llamar las veces que haga falta. Tambien salta a quien se dio de alta
 * despues del mes que se esta emitiendo, para no cobrarle meses en los que
 * todavia no estudiaba aqui.
 */
async function ensureMonthlyCharges({
  month = currentPeriod().month,
  year = currentPeriod().year,
  dueDay = env.monthlyDueDay,
  registeredById = null,
} = {}) {
  const period = { month: Number(month), year: Number(year) };
  const day = Math.min(28, Math.max(1, Number(dueDay) || 5));
  const dueDate = `${period.year}-${String(period.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const empty = { created: 0, skipped: 0, tooEarly: 0, period, dueDate };

  // Un mes anterior al arranque de la academia no tiene mensualidades.
  if (isBefore(period, startPeriod())) return { ...empty, beforeStart: true };

  const students = await Student.find({ status: 'activo', monthlyFee: { $gt: 0 } })
    .sort({ firstName: 1 });
  if (!students.length) return empty;

  // Quien ya tiene el cobro del periodo, en una sola consulta: con un findOne
  // por alumno esto crecia con el numero de alumnos sin necesidad.
  const issued = await Payment.find({
    periodMonth: period.month,
    periodYear: period.year,
    conceptType: 'mensualidad',
    status: { $ne: 'anulado' },
  }).select('studentId').lean();
  const have = new Set(issued.map((r) => r.studentId));

  let created = 0;
  let skipped = 0;
  let tooEarly = 0;
  const pending = [];

  for (const student of students) {
    if (have.has(student.id)) {
      skipped += 1;
      continue;
    }
    // El alta se guarda en UTC y Venezuela va cuatro horas por detras, asi
    // que el periodo del alta se saca con la zona de la academia.
    if (isBefore(period, currentPeriod(new Date(student.createdAt)))) {
      tooEarly += 1;
      continue;
    }
    pending.push(student);
  }

  if (!pending.length) return { ...empty, skipped, tooEarly };

  /*
   * El correlativo lo lleva el contador de la coleccion, que avanza con una
   * operacion atomica. Antes habia que calcularlo a mano dentro de la
   * transaccion porque MAX(id) no veia las filas recien insertadas; ahora no
   * hace falta, y de paso dos emisiones a la vez no pueden chocar.
   */
  for (const student of pending) {
    await Payment.create({
      receiptNumber: receiptFor(await peekNextId(Payment.collection.name)),
      studentId: student.id,
      concept: `Mensualidad ${MONTHS[period.month - 1]} ${period.year} - ${student.getFullName()}`,
      conceptType: 'mensualidad',
      amount: round2(student.monthlyFee),
      periodMonth: period.month,
      periodYear: period.year,
      dueDate,
      registeredById,
    });
    created += 1;
  }

  return { created, skipped, tooEarly, period, dueDate };
}

/**
 * Deja listo el mes en curso y vuelve a comprobarlo cada pocas horas.
 *
 * Hace falta la comprobacion periodica, no solo la del arranque: el
 * contenedor puede llevar semanas levantado y cruzar el cambio de mes sin
 * reiniciarse. La llamada es idempotente, asi que repetirla no cuesta mas que
 * dos consultas cuando no hay nada que emitir.
 */
function startAutoCharges() {
  if (!env.autoMonthlyCharges) {
    console.log('[cobros] Emision automatica desactivada (AUTO_MONTHLY_CHARGES=false)');
    return null;
  }

  const run = async () => {
    try {
      const { created, skipped, period } = await ensureMonthlyCharges();
      const label = `${MONTHS[period.month - 1]} ${period.year}`;
      if (created > 0) console.log(`[cobros] ${label}: ${created} mensualidad(es) emitida(s)`);
      else console.log(`[cobros] ${label}: al dia (${skipped} ya emitidas)`);
    } catch (error) {
      // Que falle la emision no debe tumbar la API: se reintenta al rato.
      console.error('[cobros] No se pudo emitir el mes:', error.message);
    }
  };

  run();
  const timer = setInterval(run, Math.max(1, env.autoChargesCheckHours) * 60 * 60 * 1000);
  timer.unref();
  return timer;
}

module.exports = { ensureMonthlyCharges, startAutoCharges, receiptFor, MONTHS };
