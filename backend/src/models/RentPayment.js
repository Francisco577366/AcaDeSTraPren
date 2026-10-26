const mongoose = require('mongoose');
const { todayLocal } = require('../utils/today');
const { crearEsquema, dinero, fechaSimple, correlativo, indiceCorrelativo } = require('./plugins/base');

/**
 * Pago del alquiler del local. Es un gasto fijo mensual, asi que se lleva con
 * la misma forma que los cobros: un recibo por periodo, con su fecha limite,
 * lo abonado y el saldo. Puede pactarse en dolares o en bolivares.
 */
const schema = crearEsquema(
  {
    receiptNumber: correlativo(),
    concept: { type: String, required: true, maxlength: 180 },
    // A quien se le paga
    landlord: { type: String, maxlength: 120, default: null },
    amount: dinero(),
    // Moneda en que se pacto el alquiler
    currency: { type: String, required: true, default: 'USD', enum: ['USD', 'VES'] },
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
    coleccion: 'rent_payments',
    indices: [
      indiceCorrelativo('receiptNumber'),
      { status: 1 },
      { periodYear: 1, periodMonth: 1 },
    ],
  }
);

schema.pre('validate', function antesDeValidar(next) {
  if (this.status === 'anulado') return next();

  const total = Number(this.amount || 0);
  const pagado = Number(this.paidAmount || 0);

  if (pagado <= 0) {
    // Un alquiler sin pagar y fuera de fecha es un problema, y hay que verlo:
    // por eso se marca vencido igual que los cobros.
    const hoy = todayLocal();
    const vencido = Boolean(this.dueDate) && String(this.dueDate).slice(0, 10) < hoy;
    this.status = vencido ? 'vencido' : 'pendiente';
    return next();
  }

  this.status = pagado + 0.009 < total ? 'parcial' : 'pagado';

  // Un abono parcial tambien mueve caja: sin fecha ese dinero no aparece en
  // los reportes por fecha (ver Payment.js).
  if (!this.paymentDate) {
    this.paymentDate = todayLocal();
  }
  return next();
});

schema.methods.getBalance = function getBalance() {
  return Math.max(0, Number(this.amount || 0) - Number(this.paidAmount || 0));
};

// Los calcula el hook de validacion (ver utils/persist.js).
schema.statics.derivedFields = ['status', 'paymentDate'];

module.exports = mongoose.model('RentPayment', schema);
