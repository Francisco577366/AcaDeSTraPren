const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { round2 } = require('../utils/money');
const { recortarSueldo, recortarSueldos } = require('../config/roles');
const { createCrudController } = require('./crudFactory');
const { Employee, EmployeePayment } = require('../models');

/**
 * Quien no es administrador ve la lista de trabajadors (la necesita para
 * asignar trabajos) pero no lo que cobra cada uno.
 */
function serialize(row, req) {
  if (!row) return row;
  const data = row.toJSON ? row.toJSON() : row;
  data.fullName = `${data.firstName} ${data.lastName || ''}`.trim();
  return recortarSueldo(data, req?.user);
}

const crud = createCrudController({
  model: Employee,
  name: 'Trabajador',
  searchFields: ['firstName', 'lastName', 'documentId', 'email', 'position'],
  filterFields: ['status', 'payType'],
  order: { lastName: 1, firstName: 1 },
  serialize,
});

/** Ficha del trabajador con su historial de nomina y saldos. */
const profile = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ id: Number(req.params.id) });
  if (!employee) throw ApiError.notFound('Trabajador no encontrado');

  const payments = await EmployeePayment.find({ employeeId: employee.id })
    .sort({ periodYear: -1, periodMonth: -1, id: -1 });

  const active = payments.filter((p) => p.status !== 'anulado');

  res.json({
    success: true,
    data: {
      employee: serialize(employee),
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

/** Lista compacta del personal activo, con lo que gana. */
const options = asyncHandler(async (req, res) => {
  const rows = await Employee.find({ status: 'activo' })
    .select([
      'id', 'firstName', 'lastName', 'position',
      'payType', 'payAmount', 'weeklyHours',
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
