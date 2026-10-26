const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { round2 } = require('../utils/money');
const { recortarMargen } = require('../config/roles');
const { createCrudController } = require('./crudFactory');
const { peekNextId } = require('../models/plugins/autoIncrement');
const { Product } = require('../models');

function serialize(row) {
  if (!row) return row;
  const data = row.toJSON ? row.toJSON() : row;
  data.margin = row.getMargin ? row.getMargin() : 0;
  data.stockValue = row.getStockValue ? row.getStockValue() : 0;
  data.lowStock = row.isLowStock ? row.isLowStock() : false;
  return data;
}

const codeFor = (id) => `PRD-${String(id).padStart(6, '0')}`;

async function beforeWrite(body, req, existing) {
  if (!existing && !body.code) {
    body.code = codeFor(await peekNextId(Product.collection.name));
  }
  return body;
}

const crud = createCrudController({
  model: Product,
  name: 'Producto',
  searchFields: ['name', 'code', 'description'],
  filterFields: ['category', 'active'],
  order: { name: 1 },
  serialize,
  beforeWrite,
});

/**
 * Entrada o salida de mercancia sin pasar por una venta: reposiciones,
 * mermas o ajustes de inventario. La cantidad puede ser negativa.
 */
const adjustStock = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ id: Number(req.params.id) });
  if (!product) throw ApiError.notFound('Producto no encontrado');

  const quantity = Number(req.body.quantity || 0);
  if (!Number.isInteger(quantity) || quantity === 0) {
    throw ApiError.badRequest('Indica una cantidad entera distinta de cero');
  }

  const newStock = Number(product.stock || 0) + quantity;
  if (newStock < 0) {
    throw ApiError.badRequest(`No puedes descontar mas de lo que hay en stock (${product.stock})`);
  }

  const note = `${quantity > 0 ? 'Entrada' : 'Salida'} de ${Math.abs(quantity)}: ${
    req.body.reason || 'ajuste de inventario'
  }`;

  product.stock = newStock;
  product.description = [product.description, note].filter(Boolean).join(' | ');
  await product.save();

  res.json({
    success: true,
    data: serialize(product),
    message: `Stock actualizado a ${newStock}`,
  });
});

/** Lista compacta de productos disponibles, para el selector de ventas. */
const options = asyncHandler(async (req, res) => {
  const rows = await Product.find({ active: true })
    .select('id code name price cost stock')
    .sort({ name: 1 })
    .lean();
  res.json({ success: true, data: rows });
});

/** Valor del inventario y productos por reponer. */
const inventory = asyncHandler(async (req, res) => {
  const products = await Product.find({ active: true });

  const stockValue = round2(products.reduce((a, p) => a + p.getStockValue(), 0));
  const retailValue = round2(
    products.reduce((a, p) => a + Number(p.price || 0) * Number(p.stock || 0), 0)
  );
  const lowStock = products.filter((p) => p.isLowStock()).map(serialize);

  const datos = {
      productsCount: products.length,
      unitsInStock: products.reduce((a, p) => a + Number(p.stock || 0), 0),
      stockValue,
      retailValue,
      potentialMargin: round2(retailValue - stockValue),
      lowStockCount: lowStock.length,
      lowStock,
  };

  // El costo de la mercancia y el margen potencial son del dueno.
  res.json({ success: true, data: recortarMargen(datos, req.user) });
});

module.exports = { ...crud, adjustStock, options, inventory };
