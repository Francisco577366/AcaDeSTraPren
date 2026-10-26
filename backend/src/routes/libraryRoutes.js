const { Router } = require('express');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const products = require('../controllers/productController');
const sales = require('../controllers/saleController');

const router = Router();
router.use(authenticate);

const productRules = [
  body('name').trim().notEmpty().withMessage('El nombre del producto es obligatorio'),
  body('cost').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('Costo invalido'),
  body('price').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('Precio invalido'),
  body('stock').optional({ values: 'null' }).isInt({ min: 0 }).withMessage('Stock invalido'),
  body('minStock').optional({ values: 'null' }).isInt({ min: 0 }).withMessage('Minimo invalido'),
  body('category')
    .optional({ values: 'null' })
    .isIn(['libro', 'cuaderno', 'papeleria', 'arte', 'uniforme', 'otro']),
];

/* ------------------------------------------------------------------ */
/* Productos                                                           */
/* ------------------------------------------------------------------ */

/**
 * @openapi
 * /library/products/options:
 *   get:
 *     tags: [Libreria]
 *     summary: Lista compacta de productos disponibles
 *     description: Incluye precio, costo y stock, para armar una venta.
 *     responses:
 *       200: { description: Productos activos }
 */
router.get('/products/options', products.options);

/**
 * @openapi
 * /library/products/inventory:
 *   get:
 *     tags: [Libreria]
 *     summary: Valor del inventario y productos por reponer
 *     responses:
 *       200: { description: Unidades, valor a costo, valor a venta y faltantes }
 */
router.get('/products/inventory', products.inventory);

/**
 * @openapi
 * /library/products:
 *   get:
 *     tags: [Libreria]
 *     summary: Listar los productos de la libreria
 *     parameters:
 *       - $ref: '#/components/parameters/page'
 *       - $ref: '#/components/parameters/limit'
 *       - $ref: '#/components/parameters/search'
 *       - $ref: '#/components/parameters/sort'
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [libro, cuaderno, papeleria, arte, uniforme, otro] }
 *       - in: query
 *         name: active
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Listado paginado con margen y valor de stock calculados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Product' }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 *   post:
 *     tags: [Libreria]
 *     summary: Registrar un producto
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Product' }
 *     responses:
 *       201: { description: Producto creado }
 */
router.route('/products').get(products.list).post(productRules, validate, products.create);

/**
 * @openapi
 * /library/products/{id}/stock:
 *   post:
 *     tags: [Libreria]
 *     summary: Ajustar el stock de un producto
 *     description: >
 *       Entrada o salida de mercancia sin pasar por una venta. La cantidad
 *       puede ser negativa para registrar mermas.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantity]
 *             properties:
 *               quantity: { type: integer, example: 12 }
 *               reason: { type: string, example: Compra al proveedor }
 *     responses:
 *       200: { description: Stock actualizado }
 *       400: { $ref: '#/components/responses/BadRequest' }
 */
router.post('/products/:id/stock', products.adjustStock);

/**
 * @openapi
 * /library/products/{id}:
 *   get:
 *     tags: [Libreria]
 *     summary: Detalle de un producto
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Producto encontrado }
 *   put:
 *     tags: [Libreria]
 *     summary: Actualizar un producto
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Producto actualizado }
 *   delete:
 *     tags: [Libreria]
 *     summary: Eliminar un producto
 *     description: Si ya se vendio, conviene desactivarlo en vez de borrarlo.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Producto eliminado }
 */
router
  .route('/products/:id')
  .get(products.getOne)
  .put(productRules, validate, products.update)
  .delete(authorize('admin'), products.remove);

/* ------------------------------------------------------------------ */
/* Ventas                                                              */
/* ------------------------------------------------------------------ */

/**
 * @openapi
 * /library/sales/summary:
 *   get:
 *     tags: [Libreria]
 *     summary: Indicadores y estadisticas de la libreria
 *     description: >
 *       Ventas del mes y acumuladas con su porcentaje de ganancia, los diez
 *       productos mas vendidos (unidades, ganancia, margen y peso sobre el
 *       total) y la serie de ventas mes a mes del anio.
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *     responses:
 *       200: { description: month, overall, byStatus, topProducts y byMonth }
 */
router.get('/sales/summary', sales.summary);

/**
 * @openapi
 * /library/sales:
 *   get:
 *     tags: [Libreria]
 *     summary: Listar las ventas de la libreria
 *     parameters:
 *       - $ref: '#/components/parameters/page'
 *       - $ref: '#/components/parameters/limit'
 *       - $ref: '#/components/parameters/search'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pendiente, parcial, pagado, anulado] }
 *       - in: query
 *         name: studentId
 *         schema: { type: integer }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Listado paginado con sus renglones
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Sale' }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 *   post:
 *     tags: [Libreria]
 *     summary: Registrar una venta
 *     description: >
 *       Valida el stock disponible, congela nombre y precios de cada producto
 *       y descuenta el inventario. Si no se envia paidAmount se asume pagada.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SaleInput' }
 *     responses:
 *       201: { description: Venta registrada }
 *       400: { description: Sin stock suficiente o datos invalidos }
 */
router.route('/sales').get(sales.list).post(sales.create);

/**
 * @openapi
 * /library/sales/{id}/settle:
 *   post:
 *     tags: [Libreria]
 *     summary: Registrar un abono sobre una venta a credito
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount: { type: number, example: 15 }
 *               method: { type: string }
 *               reference: { type: string }
 *     responses:
 *       200: { description: Abono registrado }
 */
router.post('/sales/:id/settle', [body('amount').isFloat({ gt: 0 })], validate, sales.settle);

/**
 * @openapi
 * /library/sales/{id}/void:
 *   post:
 *     tags: [Libreria]
 *     summary: Anular una venta
 *     description: Devuelve la mercancia al inventario y conserva el registro.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Venta anulada y stock devuelto }
 */
router.post('/sales/:id/void', authorize('admin'), sales.voidSale);

/**
 * @openapi
 * /library/sales/{id}:
 *   get:
 *     tags: [Libreria]
 *     summary: Detalle de una venta con sus renglones
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Venta encontrada }
 *   delete:
 *     tags: [Libreria]
 *     summary: Eliminar una venta
 *     description: Devuelve el stock si la venta no estaba anulada.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Venta eliminada }
 */
router.route('/sales/:id').get(sales.getOne).delete(authorize('admin'), sales.remove);

module.exports = router;
