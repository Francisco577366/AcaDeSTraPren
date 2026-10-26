const { Router } = require('express');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const ctrl = require('../controllers/rentController');

const router = Router();
// Router entero reservado al administrador.
// Lo que cuesta el local es informacion del negocio.
router.use(authenticate, authorize('admin'));

const rules = [
  body('concept').trim().notEmpty().withMessage('El concepto es obligatorio'),
  body('amount').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('Monto invalido'),
  body('paidAmount').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('currency').optional({ values: 'null' }).isIn(['USD', 'VES']).withMessage('Moneda invalida'),
  body('periodMonth').optional({ values: 'falsy' }).isInt({ min: 1, max: 12 }),
  body('periodYear').optional({ values: 'falsy' }).isInt({ min: 2000, max: 2100 }),
];

/**
 * @openapi
 * /rent/summary:
 *   get:
 *     tags: [Alquiler]
 *     summary: Resumen del alquiler del anio
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer, example: 2026 }
 *     responses:
 *       200: { description: Totales por estado y por mes }
 */
router.get('/summary', ctrl.summary);

/**
 * @openapi
 * /rent/generate:
 *   post:
 *     tags: [Alquiler]
 *     summary: Emitir el alquiler del periodo
 *     description: >
 *       Crea el recibo del mes con el monto habitual (BASE_RENT) para no
 *       escribirlo cada vez. Falla si el periodo ya tiene uno emitido.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               month: { type: integer, minimum: 1, maximum: 12 }
 *               year: { type: integer }
 *               amount: { type: number, description: Sobrescribe el monto habitual }
 *               currency: { type: string, enum: [USD, VES] }
 *               dueDay: { type: integer, minimum: 1, maximum: 28 }
 *               landlord: { type: string }
 *     responses:
 *       201: { description: Alquiler emitido }
 *       409: { description: El periodo ya tiene alquiler emitido }
 */
router.post('/generate', ctrl.generate);

/**
 * @openapi
 * /rent:
 *   get:
 *     tags: [Alquiler]
 *     summary: Listar los pagos de alquiler
 *     parameters:
 *       - $ref: '#/components/parameters/page'
 *       - $ref: '#/components/parameters/limit'
 *       - $ref: '#/components/parameters/search'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pendiente, parcial, pagado, vencido, anulado] }
 *       - in: query
 *         name: periodMonth
 *         schema: { type: integer }
 *       - in: query
 *         name: periodYear
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Listado paginado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/RentPayment' }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 *   post:
 *     tags: [Alquiler]
 *     summary: Registrar un pago de alquiler
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RentPayment' }
 *     responses:
 *       201: { description: Registrado }
 */
router.route('/').get(ctrl.list).post(rules, validate, ctrl.create);

/**
 * @openapi
 * /rent/{id}/settle:
 *   post:
 *     tags: [Alquiler]
 *     summary: Registrar un abono del alquiler
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
 *               amount: { type: number }
 *               paymentDate: { type: string, format: date }
 *               method: { type: string }
 *               reference: { type: string }
 *     responses:
 *       200: { description: Pago registrado }
 */
router.post('/:id/settle', [body('amount').isFloat({ gt: 0 })], validate, ctrl.settle);

/**
 * @openapi
 * /rent/{id}/void:
 *   post:
 *     tags: [Alquiler]
 *     summary: Anular un recibo de alquiler
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Recibo anulado }
 */
router.post('/:id/void', ctrl.voidPayment);

/**
 * @openapi
 * /rent/{id}:
 *   get:
 *     tags: [Alquiler]
 *     summary: Detalle de un pago de alquiler
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Encontrado }
 *   put:
 *     tags: [Alquiler]
 *     summary: Modificar un pago de alquiler
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Actualizado }
 *   delete:
 *     tags: [Alquiler]
 *     summary: Eliminar un pago de alquiler
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Eliminado }
 */
router.route('/:id').get(ctrl.getOne).put(rules, validate, ctrl.update).delete(ctrl.remove);

module.exports = router;
