const mongoose = require('mongoose');
const { todayLocal } = require('../utils/today');
const { crearEsquema, dinero, correlativo, indiceCorrelativo } = require('./plugins/base');

/**
 * Pago personal: dinero que sale de la caja para el bolsillo, no para el
 * negocio. No es un gasto de la academia, asi que NO reduce su ganancia: es
 * un retiro sobre esa ganancia, y por eso se lleva aparte.
 *
 * No tiene estados ni saldos como los cobros: se registra cuando ya ocurrio.
 */
const schema = crearEsquema(
  {
    receiptNumber: correlativo(),
    concept: { type: String, required: true, maxlength: 180 },
    category: {
      type: String,
      required: true,
      default: 'retiro',
      enum: ['retiro', 'salud', 'hogar', 'transporte', 'otro'],
    },
    amount: dinero(),
    // De la caja en dolares o de la de bolivares (libreria)
    currency: { type: String, required: true, default: 'USD', enum: ['USD', 'VES'] },
    /**
     * Cuando salio el dinero; por aqui se cuenta en el mes. El valor por
     * defecto es hoy SEGUN LA ACADEMIA, no segun el reloj del servidor: con
     * Date.now() un retiro registrado de noche caeria en el dia siguiente.
     */
    paymentDate: {
      type: String,
      required: true,
      default: () => todayLocal(),
      match: [/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser aaaa-mm-dd'],
    },
    method: {
      type: String,
      required: true,
      default: 'efectivo',
      enum: ['efectivo', 'transferencia', 'pago_movil', 'tarjeta', 'zelle', 'otro'],
    },
    reference: { type: String, maxlength: 80, default: null },
    notes: { type: String, default: null },
    registeredById: { type: Number, default: null },
  },
  {
    coleccion: 'personal_payments',
    indices: [
      indiceCorrelativo('receiptNumber'),
      { paymentDate: 1 },
      { category: 1 },
    ],
  }
);

module.exports = mongoose.model('PersonalPayment', schema);
