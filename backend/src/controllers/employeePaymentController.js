const { createPayrollController } = require('./payrollFactory');
const { EmployeePayment, Employee } = require('../models');

/**
 * Nomina del personal de la libreria. Misma regla que la docente: las semanas
 * del periodo por el pago semanal de cada uno.
 */
module.exports = createPayrollController({
  Pago: EmployeePayment,
  Persona: Employee,
  personaId: 'employeeId',
  personaComo: 'employee',
  prefijo: 'LIB-',
  nombre: 'Pago al personal',
  conceptoNomina: 'Nomina libreria',
  camposPersona: ['id', 'firstName', 'lastName', 'documentId', 'position'],
  // El pago semanal ya lo calcula el modelo a partir de lo pactado.
  pagoSemanalDe: (e) => e.weeklySalary,
});
