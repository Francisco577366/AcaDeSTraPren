const mongoose = require('mongoose');
const env = require('../config/env');
const { round2 } = require('../utils/money');
const { crearEsquema, dinero, fechaSimple } = require('./plugins/base');

/**
 * Personal de la libreria. No da clases, asi que no cobra por alumno: se le
 * pacta un monto semanal, mensual o por hora y de ahi salen los tres valores
 * que necesita la nomina, igual que con los profesores.
 */
const schema = crearEsquema(
  {
    firstName: { type: String, required: true, maxlength: 80, trim: true },
    lastName: { type: String, maxlength: 80, default: null, trim: true },
    // Datos de contacto: todos opcionales.
    documentId: { type: String, maxlength: 30, default: null },
    email: { type: String, maxlength: 160, default: null, lowercase: true, trim: true },
    phone: { type: String, maxlength: 40, default: null },
    address: { type: String, maxlength: 255, default: null },
    // Cargo dentro de la libreria
    position: { type: String, maxlength: 120, default: null },

    /* --- Lo que se pacta --- */
    payType: {
      type: String,
      required: true,
      default: 'semanal',
      enum: ['semanal', 'mensual', 'por_hora'],
    },
    // Monto acordado para el tipo de pago elegido
    payAmount: dinero(),
    // Horas de trabajo por semana
    weeklyHours: dinero(),

    /* --- Lo que calcula el sistema --- */
    // Calculado: base de la nomina, se paga por semanas
    weeklySalary: dinero(),
    // Calculado: pago semanal x semanas del mes
    monthlySalary: dinero(),
    // Calculado: pago semanal entre los dias de trabajo de la semana
    dailyRate: dinero(),
    // Calculado: pago semanal entre las horas de la semana
    hourlyRate: dinero(),

    hireDate: fechaSimple(),
    status: {
      type: String,
      required: true,
      default: 'activo',
      enum: ['activo', 'inactivo', 'suspendido'],
    },
    notes: { type: String, default: null },
  },
  {
    coleccion: 'employees',
    indices: [{ lastName: 1 }, { status: 1 }],
  }
);

schema.pre('validate', function antesDeValidar(next) {
  // Todo se reduce al pago semanal, que es lo que consume la nomina.
  const monto = Number(this.payAmount || 0);
  const horas = Number(this.weeklyHours || 0);

  let semanal = monto;
  if (this.payType === 'mensual') semanal = monto / env.weeksPerMonth;
  if (this.payType === 'por_hora') semanal = monto * horas;

  this.weeklySalary = round2(semanal);
  this.monthlySalary = round2(semanal * env.weeksPerMonth);
  this.dailyRate = env.daysPerWeek > 0 ? round2(semanal / env.daysPerWeek) : 0;
  this.hourlyRate = this.payType === 'por_hora'
    ? round2(monto)
    : horas > 0 ? round2(semanal / horas) : 0;
  return next();
});

schema.methods.getFullName = function getFullName() {
  return `${this.firstName} ${this.lastName || ''}`.trim();
};

// Los calcula el hook de validacion (ver utils/persist.js).
schema.statics.derivedFields = ['weeklySalary', 'monthlySalary', 'dailyRate', 'hourlyRate'];

module.exports = mongoose.model('Employee', schema);
