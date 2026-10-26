const env = require('../config/env');
const { createPayrollController } = require('./payrollFactory');
const { TeacherPayment, Teacher } = require('../models');

/**
 * Nomina docente. La forma la pone el factory compartido con la libreria,
 * para que el panel pueda sumar las dos sin traducir nada.
 */
module.exports = createPayrollController({
  Pago: TeacherPayment,
  Persona: Teacher,
  personaId: 'teacherId',
  personaComo: 'teacher',
  prefijo: 'NOM-',
  nombre: 'Pago a profesor',
  conceptoNomina: 'Nomina',
  camposPersona: ['id', 'firstName', 'lastName', 'documentId', 'contractType'],
  // Ambos contratos tienen un pago definido: el fijo a mano y el de por
  // alumno calculado como alumnos x tarifa. Al resto no se le genera.
  filtroPersonas: { status: 'activo', contractType: { $in: ['por_alumno', 'fijo'] } },
  /*
   * El pago semanal es la base de la nomina. Los de salario fijo no lo tienen
   * guardado, asi que se deduce repartiendo su sueldo mensual entre las
   * semanas del mes.
   */
  pagoSemanalDe: (t) => (Number(t.weeklySalary) > 0
    ? t.weeklySalary
    : Number(t.monthlySalary || 0) / env.weeksPerMonth),
});
