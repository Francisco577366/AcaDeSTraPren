const mongoose = require('mongoose');
const { todayLocal } = require('../utils/today');
const { crearEsquema, dinero, fechaSimple, correlativo, indiceCorrelativo } = require('./plugins/base');

const schema = crearEsquema(
  {
    receiptNumber: correlativo(),
    studentId: { type: Number, required: true },
    studentWorkId: { type: Number, default: null },
    concept: { type: String, required: true, maxlength: 180 },
    conceptType: {
      type: String,
      required: true,
      default: 'mensualidad',
      enum: ['mensualidad', 'inscripcion', 'material', 'trabajo', 'transporte', 'otro'],
    },
    // Monto total facturado al representante
    amount: dinero(),
    discount: dinero(),
    // Recargo por mora u otros
    surcharge: dinero(),
    // Monto abonado, editable en cualquier momento
    paidAmount: dinero(),
    periodMonth: { type: Number, default: null, min: 1, max: 12 },
    periodYear: { type: Number, default: null, min: 2000, max: 2100 },
    dueDate: fechaSimple(),
    paymentDate: fechaSimple(),
    method: {
      type: String,
      required: true,
      default: 'efectivo',
      enum: ['efectivo', 'transferencia', 'pago_movil', 'tarjeta', 'zelle', 'otro'],
    },
    reference: { type: String, maxlength: 80, default: null },
    status: {
      type: String,
      required: true,
      default: 'pendiente',
      enum: ['pendiente', 'parcial', 'pagado', 'vencido', 'anulado'],
    },
    notes: { type: String, default: null },
    registeredById: { type: Number, default: null },
  },
  {
    coleccion: 'payments',
    indices: [
      indiceCorrelativo('receiptNumber'),
      { studentId: 1 },
      { status: 1 },
      { periodYear: 1, periodMonth: 1 },
      { paymentDate: 1 },
      // El panel y la cobranza preguntan siempre por periodo y concepto a la
      // vez; con un indice compuesto se resuelve sin recorrer la coleccion.
      { periodYear: 1, periodMonth: 1, conceptType: 1, status: 1 },
    ],
  }
);

/** Recalcula el estado a partir de lo facturado y lo abonado. */
function recalcular(doc) {
  if (doc.status === 'anulado') return;

  const total = Number(doc.amount || 0) - Number(doc.discount || 0) + Number(doc.surcharge || 0);
  const paid = Number(doc.paidAmount || 0);

  if (paid <= 0) {
    const hoy = todayLocal();
    const vencido = Boolean(doc.dueDate) && String(doc.dueDate).slice(0, 10) < hoy;
    doc.status = vencido ? 'vencido' : 'pendiente';
    return;
  }

  doc.status = paid + 0.009 < total ? 'parcial' : 'pagado';

  // En cuanto entra dinero hay que sellar la fecha, aunque sea un abono
  // parcial: los ingresos del mes y el flujo del anio se miden por
  // paymentDate, y sin fecha ese dinero no aparece en ninguno de los dos.
  if (!doc.paymentDate) {
    doc.paymentDate = todayLocal();
  }
}

schema.pre('validate', function antesDeValidar(next) {
  recalcular(this);
  next();
});

/** Monto neto exigible (monto - descuento + recargo). */
schema.methods.getTotal = function getTotal() {
  return Number(this.amount || 0) - Number(this.discount || 0) + Number(this.surcharge || 0);
};

/** Saldo pendiente, nunca negativo. */
schema.methods.getBalance = function getBalance() {
  return Math.max(0, this.getTotal() - Number(this.paidAmount || 0));
};

/**
 * Lo mismo que getTotal pero para las agregaciones, donde no hay documento
 * sino fases del pipeline. Se define una vez aqui para que la formula del
 * neto no acabe escrita de tres maneras distintas por los controladores.
 */
schema.statics.TOTAL = {
  $subtract: [{ $add: ['$amount', '$surcharge'] }, '$discount'],
};
schema.statics.SALDO = {
  $subtract: [{ $add: ['$amount', '$surcharge'] }, { $add: ['$discount', '$paidAmount'] }],
};

// Los calcula el hook de validacion, asi que hay que escribirlos
// explicitamente en las actualizaciones (ver utils/persist.js).
schema.statics.derivedFields = ['status', 'paymentDate'];

module.exports = mongoose.model('Payment', schema);
