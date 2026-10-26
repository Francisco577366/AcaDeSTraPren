const mongoose = require('mongoose');
const { todayLocal } = require('../utils/today');
const { crearEsquema, dinero, correlativo, indiceCorrelativo } = require('./plugins/base');

const schema = crearEsquema(
  {
    receiptNumber: correlativo(),
    // Si la venta es a un alumno; queda vacio en ventas al publico
    studentId: { type: Number, default: null },
    // Comprador cuando no es un alumno registrado
    buyerName: { type: String, maxlength: 160, default: null },
    saleDate: {
      type: String,
      required: true,
      default: () => todayLocal(),
      match: [/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser aaaa-mm-dd'],
    },
    // Suma de los renglones; lo calcula el controlador
    subtotal: dinero(),
    discount: dinero(),
    // Lo que se cobro de mas sobre los renglones (impresion a color, acabados)
    surcharge: dinero(),
    // Costo de lo vendido, para calcular la ganancia
    cost: dinero(),
    paidAmount: dinero(),
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
      enum: ['pendiente', 'parcial', 'pagado', 'anulado'],
    },
    notes: { type: String, default: null },
    registeredById: { type: Number, default: null },
  },
  {
    coleccion: 'sales',
    indices: [
      indiceCorrelativo('receiptNumber'),
      { studentId: 1 },
      { status: 1 },
      { saleDate: 1 },
    ],
  }
);

schema.pre('validate', function antesDeValidar(next) {
  if (this.status === 'anulado') return next();

  const total = Number(this.subtotal || 0) - Number(this.discount || 0) + Number(this.surcharge || 0);
  const pagado = Number(this.paidAmount || 0);

  if (pagado <= 0) this.status = 'pendiente';
  else if (pagado + 0.009 < total) this.status = 'parcial';
  else this.status = 'pagado';

  return next();
});

/**
 * Precio final de la venta. Sale de los renglones, corregido con lo que se
 * haya rebajado o cobrado de mas: el precio que se escribe a mano manda.
 */
schema.methods.getTotal = function getTotal() {
  return Number(this.subtotal || 0) - Number(this.discount || 0) + Number(this.surcharge || 0);
};

/** Saldo por cobrar, nunca negativo. */
schema.methods.getBalance = function getBalance() {
  return Math.max(0, this.getTotal() - Number(this.paidAmount || 0));
};

/** Ganancia de la venta: lo cobrado menos lo que costo la mercancia. */
schema.methods.getProfit = function getProfit() {
  return this.getTotal() - Number(this.cost || 0);
};

/** La misma formula del neto, para usarla dentro de las agregaciones. */
schema.statics.TOTAL = {
  $subtract: [{ $add: ['$subtotal', '$surcharge'] }, '$discount'],
};
schema.statics.SALDO = {
  $subtract: [{ $add: ['$subtotal', '$surcharge'] }, { $add: ['$discount', '$paidAmount'] }],
};

// Los calcula el hook de validacion (ver utils/persist.js).
schema.statics.derivedFields = ['status'];

module.exports = mongoose.model('Sale', schema);
