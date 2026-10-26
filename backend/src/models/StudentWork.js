const mongoose = require('mongoose');
const { todayLocal } = require('../utils/today');
const { crearEsquema, dinero, fechaSimple, correlativo, indiceCorrelativo } = require('./plugins/base');

const schema = crearEsquema(
  {
    code: correlativo(),
    studentId: { type: Number, required: true },
    teacherId: { type: Number, default: null },
    title: { type: String, required: true, maxlength: 180 },
    description: { type: String, default: null },
    category: {
      type: String,
      required: true,
      default: 'proyecto',
      enum: ['proyecto', 'tarea', 'taller', 'material', 'uniforme', 'evaluacion', 'otro'],
    },
    assignedDate: {
      type: String,
      required: true,
      default: () => todayLocal(),
      match: [/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser aaaa-mm-dd'],
    },
    dueDate: fechaSimple(),
    deliveryDate: fechaSimple(),
    status: {
      type: String,
      required: true,
      default: 'pendiente',
      enum: ['pendiente', 'en_proceso', 'entregado', 'aprobado', 'reprobado', 'cancelado'],
    },
    grade: { type: Number, default: null, min: 0, max: 20 },
    // Costo de materiales/insumos asumido por la academia
    materialCost: dinero(),
    // Costo de mano de obra o asesoria asociado al trabajo
    laborCost: dinero(),
    // Monto cobrado al representante por este trabajo
    price: dinero(),
    paidAmount: dinero(),
    paymentStatus: {
      type: String,
      required: true,
      default: 'pendiente',
      enum: ['sin_costo', 'pendiente', 'parcial', 'pagado'],
    },
    notes: { type: String, default: null },
    // Quien lo registro, para la pantalla de actividad.
    registeredById: { type: Number, default: null },
  },
  {
    coleccion: 'student_works',
    indices: [
      indiceCorrelativo('code'),
      { studentId: 1 },
      { status: 1 },
      { paymentStatus: 1 },
    ],
  }
);

schema.pre('validate', function antesDeValidar(next) {
  const precio = Number(this.price || 0);
  const pagado = Number(this.paidAmount || 0);

  if (precio <= 0) this.paymentStatus = 'sin_costo';
  else if (pagado <= 0) this.paymentStatus = 'pendiente';
  else if (pagado + 0.009 < precio) this.paymentStatus = 'parcial';
  else this.paymentStatus = 'pagado';

  next();
});

/** Costo total incurrido por la academia. */
schema.methods.getTotalCost = function getTotalCost() {
  return Number(this.materialCost || 0) + Number(this.laborCost || 0);
};

/** Diferencia entre lo cobrado y lo que costo producirlo. */
schema.methods.getMargin = function getMargin() {
  return Number(this.price || 0) - this.getTotalCost();
};

/** Saldo pendiente de cobro. */
schema.methods.getBalance = function getBalance() {
  return Math.max(0, Number(this.price || 0) - Number(this.paidAmount || 0));
};

// Lo calcula el hook de validacion (ver utils/persist.js).
schema.statics.derivedFields = ['paymentStatus'];

module.exports = mongoose.model('StudentWork', schema);
