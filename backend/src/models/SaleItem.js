const mongoose = require('mongoose');
const { crearEsquema, dinero } = require('./plugins/base');

/**
 * Renglon de una venta. Guarda una copia del nombre, el precio y el costo del
 * producto: si mas adelante cambian, la venta sigue reflejando lo que
 * realmente se cobro ese dia.
 *
 * Se queda como coleccion propia en vez de incrustarse dentro de la venta,
 * aunque en Mongo lo natural seria incrustarlo: las estadisticas de la
 * libreria preguntan "que producto se vende mas" cruzando TODOS los renglones
 * de todas las ventas, y eso se resuelve mejor sobre una coleccion suya.
 */
const schema = crearEsquema(
  {
    saleId: { type: Number, required: true },
    productId: { type: Number, default: null },
    name: { type: String, required: true, maxlength: 160 },
    quantity: { type: Number, required: true, default: 1, min: 1 },
    unitPrice: dinero(),
    unitCost: dinero(),
    subtotal: dinero(),
  },
  {
    coleccion: 'sale_items',
    indices: [{ saleId: 1 }, { productId: 1 }],
  }
);

module.exports = mongoose.model('SaleItem', schema);
