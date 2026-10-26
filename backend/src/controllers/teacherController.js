const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { round2 } = require('../utils/money');
const { recortarSueldo, recortarSueldos } = require('../config/roles');
const { createCrudController } = require('./crudFactory');
const { Teacher, TeacherPayment } = require('../models');

/**
 * Quien no es administrador ve la lista de profesors (la necesita para
 * asignar trabajos) pero no lo que cobra cada uno.
 */
function serialize(row, req) {
  if (!row) return row;
  const data = row.toJSON ? row.toJSON() : row;
  data.fullName = `${data.firstName} ${data.lastName || ''}`.trim();
  return recortarSueldo(data, req?.user);
}

const crud = createCrudController({
  model: Teacher,
  name: 'Profesor',
  searchFields: ['firstName', 'lastName', 'documentId', 'email', 'specialty'],
  filterFields: ['status', 'contractType'],
  order: { lastName: 1, firstName: 1 },
  serialize,
});

/** Ficha del profesor con su historial de nomina y saldos. */
const profile = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findOne({ id: Number(req.params.id) });
  if (!teacher) throw ApiError.notFound('Profesor no encontrado');

  const payments = await TeacherPayment.find({ teacherId: teacher.id })
    .sort({ periodYear: -1, periodMonth: -1, id: -1 });

  const active = payments.filter((p) => p.status !== 'anulado');

  res.json({
    success: true,
    data: {
      teacher: serialize(teacher),
      payments: payments.map((p) => ({
        ...p.toJSON(),
        total: p.getTotal(),
        balance: p.getBalance(),
      })),
      summary: {
        totalAccrued: round2(active.reduce((a, p) => a + p.getTotal(), 0)),
        totalPaid: round2(active.reduce((a, p) => a + Number(p.paidAmount || 0), 0)),
        pendingBalance: round2(active.reduce((a, p) => a + p.getBalance(), 0)),
        paymentsCount: payments.length,
      },
    },
  });
});

/** Lista compacta de profesores activos, con sus tarifas. */
const options = asyncHandler(async (req, res) => {
  const rows = await Teacher.find({ status: 'activo' })
    .select([
      'id', 'firstName', 'lastName', 'contractType',
      'studentsCount', 'studentRate', 'weeklyHours',
      'weeklySalary', 'monthlySalary', 'dailyRate', 'hourlyRate',
    ].join(' '))
    .sort({ lastName: 1, firstName: 1 })
    .lean();

  // El selector pasa por el mismo recorte que el listado: aqui tambien
  // viajan los sueldos, y quien no es administrador no tiene por que verlos.
  const filas = recortarSueldos(rows, req.user)
    .map((r) => ({ ...r, fullName: `${r.firstName} ${r.lastName || ''}`.trim() }));

  res.json({ success: true, data: filas });
});

module.exports = { ...crud, profile, options };
