const mongoose = require('mongoose');
const { crearEsquemaNomina } = require('./plugins/payroll');

/**
 * Recibo de nomina de un profesor. El monto son las semanas que cubre por su
 * pago semanal; la forma la define el esquema compartido con la libreria,
 * para que el panel pueda sumar las dos nominas sin traducir nada.
 */
const schema = crearEsquemaNomina({
  coleccion: 'teacher_payments',
  personaId: 'teacherId',
  metodo: 'transferencia',
});

module.exports = mongoose.model('TeacherPayment', schema);
