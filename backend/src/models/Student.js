const mongoose = require('mongoose');
const env = require('../config/env');
const { crearEsquema, dinero } = require('./plugins/base');

const schema = crearEsquema(
  {
    firstName: { type: String, required: true, maxlength: 80, trim: true },
    lastName: { type: String, maxlength: 80, default: null, trim: true },
    documentId: { type: String, maxlength: 30, default: null },
    grade: { type: String, maxlength: 60, default: null },
    // Mensualidad de este alumno; por defecto, el precio base
    monthlyFee: dinero(env.baseMonthlyFee),
    status: {
      type: String,
      required: true,
      default: 'activo',
      enum: ['activo', 'inactivo', 'egresado', 'retirado'],
    },
    // Quien lo registro, para la pantalla de actividad.
    registeredById: { type: Number, default: null },
  },
  {
    coleccion: 'students',
    indices: [{ lastName: 1 }, { status: 1 }],
  }
);

/** Nombre completo; el apellido es opcional. */
schema.methods.getFullName = function getFullName() {
  return `${this.firstName} ${this.lastName || ''}`.trim();
};

module.exports = mongoose.model('Student', schema);
