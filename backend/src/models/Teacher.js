const mongoose = require('mongoose');
const env = require('../config/env');
const { round2 } = require('../utils/money');
const { crearEsquema, dinero, fechaSimple } = require('./plugins/base');

const schema = crearEsquema(
  {
    firstName: { type: String, required: true, maxlength: 80, trim: true },
    lastName: { type: String, maxlength: 80, default: null, trim: true },
    // Datos de contacto: todos opcionales.
    documentId: { type: String, maxlength: 30, default: null },
    email: { type: String, maxlength: 160, default: null, lowercase: true, trim: true },
    phone: { type: String, maxlength: 40, default: null },
    address: { type: String, maxlength: 255, default: null },
    specialty: { type: String, maxlength: 120, default: null },

    contractType: {
      type: String,
      required: true,
      default: 'por_alumno',
      enum: ['por_alumno', 'fijo', 'por_hora', 'honorarios'],
    },

    /* --- Lo que se escribe a mano --- */
    // Alumnos a cargo del profesor
    studentsCount: { type: Number, required: true, default: 0, min: 0 },
    // Lo que cobra por cada alumno a la semana
    studentRate: dinero(env.baseStudentRate),
    // Horas de clase por semana; sirve para sacar la tarifa por hora
    weeklyHours: dinero(),

    /* --- Lo que calcula el sistema en los contratos por alumno --- */
    // Calculado: alumnos x tarifa por alumno
    weeklySalary: dinero(),
    // Calculado: pago semanal x semanas del mes
    monthlySalary: dinero(),
    // Calculado: pago semanal entre los dias de clase de la semana
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
    coleccion: 'teachers',
    indices: [{ lastName: 1 }, { status: 1 }],
  }
);

schema.pre('validate', function antesDeValidar(next) {
  // Con contrato por alumno todo sale de los alumnos y las horas: el pago de
  // la semana, el del mes, el del dia y el de la hora.
  if (this.contractType !== 'por_alumno') return next();

  const semanal = Number(this.studentsCount || 0) * Number(this.studentRate || 0);
  const horas = Number(this.weeklyHours || 0);

  this.weeklySalary = round2(semanal);
  this.monthlySalary = round2(semanal * env.weeksPerMonth);
  this.dailyRate = env.daysPerWeek > 0 ? round2(semanal / env.daysPerWeek) : 0;
  this.hourlyRate = horas > 0 ? round2(semanal / horas) : 0;
  return next();
});

schema.methods.getFullName = function getFullName() {
  return `${this.firstName} ${this.lastName || ''}`.trim();
};

// Los calcula el hook de validacion (ver utils/persist.js).
schema.statics.derivedFields = ['weeklySalary', 'monthlySalary', 'dailyRate', 'hourlyRate'];

module.exports = mongoose.model('Teacher', schema);
