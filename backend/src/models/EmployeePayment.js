const mongoose = require('mongoose');
const { crearEsquemaNomina } = require('./plugins/payroll');

/**
 * Recibo de nomina del personal de la libreria. Mismo formato que el de los
 * profesores para que las dos nominas se sumen sin traducir nada.
 */
const schema = crearEsquemaNomina({
  coleccion: 'employee_payments',
  personaId: 'employeeId',
  metodo: 'efectivo',
});

module.exports = mongoose.model('EmployeePayment', schema);
