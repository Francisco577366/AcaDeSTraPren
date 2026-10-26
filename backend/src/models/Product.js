const mongoose = require('mongoose');
const { crearEsquema, dinero, correlativo, indiceCorrelativo } = require('./plugins/base');

const schema = crearEsquema(
  {
    code: correlativo(),
    name: { type: String, required: true, maxlength: 160, trim: true },
    description: { type: String, default: null },
    category: {
      type: String,
      required: true,
      default: 'papeleria',
      enum: ['libro', 'cuaderno', 'papeleria', 'arte', 'uniforme', 'otro'],
    },
    // Lo que le cuesta el producto a la academia
    cost: dinero(),
    // Precio de venta al publico
    price: dinero(),
    stock: { type: Number, required: true, default: 0 },
    // Umbral para avisar de que hay que reponer
    minStock: { type: Number, required: true, default: 0 },
    active: { type: Boolean, required: true, default: true },
  },
  {
    coleccion: 'products',
    indices: [
      indiceCorrelativo('code'),
      { name: 1 },
      { category: 1 },
      { active: 1 },
    ],
  }
);

/** Ganancia unitaria del producto. */
schema.methods.getMargin = function getMargin() {
  return Number(this.price || 0) - Number(this.cost || 0);
};

/** Cuanto vale lo que hay en estante, a precio de costo. */
schema.methods.getStockValue = function getStockValue() {
  return Number(this.cost || 0) * Number(this.stock || 0);
};

schema.methods.isLowStock = function isLowStock() {
  return Number(this.stock || 0) <= Number(this.minStock || 0);
};

module.exports = mongoose.model('Product', schema);
