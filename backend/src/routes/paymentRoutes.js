const { Router } = require('express');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const ctrl = require('../controllers/paymentController');

const router = Router();
router.use(authenticate);

const rules = [
  body('studentId').isInt({ min: 1 }).withMessage('Debes indicar el alumno'),
  body('concept').trim().notEmpty().withMessage('El concepto es obligatorio'),
  body('amount').isFloat({ min: 0 }).withMessage('El monto debe ser un numero valido'),
  body('paidAmount').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('Monto abonado invalido'),
  body('discount').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('surcharge').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('periodMonth').optional({ values: 'falsy' }).isInt({ min: 1, max: 12 }),
  body('periodYear').optional({ values: 'falsy' }).isInt({ min: 2000, max: 2100 }),
];

/**
 * @openapi
 * /payments/summary:
 *   get:
 *     tags: [Pagos]
 *     summary: Resumen de cobranza
 *     description: Totales por estado, metodo de pago, concepto y mes del anio consultado.
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer, example: 2026 }
 *     responses:
 *       200: { description: Indicadores de cobranza }
 */
router.get('/summary', ctrl.summary);

/**
 * @openapi
 * /payments/generate-monthly:
 *   post:
 *     tags: [Pagos]
 *     summary: Generar mensualidades del periodo
 *     description: >
 *       Crea de una sola vez el cobro de mensualidad para todas las inscripciones
 *       activas. Omite las que ya fueron emitidas para ese mes y anio.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               month: { type: integer, minimum: 1, maximum: 12, example: 3 }
 *               year: { type: integer, example: 2026 }
 *               dueDay: { type: integer, minimum: 1, maximum: 28, example: 5 }
 *     responses:
 *       201: { description: Mensualidades generadas }
 */
router.post('/generate-monthly', ctrl.generateMonthly);

/**
 * @openapi
 * /payments:
 *   get:
 *     tags: [Pagos]
 *     summary: Listar pagos de representantes
 *     description: >
 *       Cada registro incluye los campos calculados total (monto - descuento + recargo)
 *       y balance (total - abonado).
 *     parameters:
 *       - $ref: '#/components/parameters/page'
 *       - $ref: '#/components/parameters/limit'
 *       - $ref: '#/components/parameters/search'
 *       - $ref: '#/components/parameters/sort'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pendiente, parcial, pagado, vencido, anulado] }
 *       - in: query
 *         name: conceptType
 *         schema: { type: string, enum: [mensualidad, inscripcion, material, trabajo, transporte, otro] }
 *       - in: query
 *         name: studentId
 *         schema: { type: integer }
 *       - in: query
 *         name: periodMonth
 *         schema: { type: integer }
 *       - in: query
 *         name: periodYear
 *         schema: { type: integer }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *         description: Fecha de pago desde
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *         description: Fecha de pago hasta
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
 *                   items: { $ref: '#/components/schemas/Payment' }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 *   post:
 *     tags: [Pagos]
 *     summary: Registrar un pago
 *     description: >
 *       El numero de recibo se genera automaticamente y el estado se calcula
 *       comparando el monto abonado con el total.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Payment' }
 *     responses:
 *       201: { description: Pago registrado }
 *       400: { $ref: '#/components/responses/BadRequest' }
 */
router.route('/').get(ctrl.list).post(rules, validate, ctrl.create);

/**
 * @openapi
 * /payments/{id}/settle:
 *   post:
 *     tags: [Pagos]
 *     summary: Registrar un abono sobre un pago existente
 *     description: Suma el monto al abonado acumulado; no puede exceder el saldo.
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
 *               amount: { type: number, example: 50 }
 *               paymentDate: { type: string, format: date }
 *               method: { type: string, enum: [efectivo, transferencia, pago_movil, tarjeta, zelle, otro] }
 *               reference: { type: string }
 *               notes: { type: string }
 *     responses:
 *       200: { description: Abono registrado }
 *       400: { $ref: '#/components/responses/BadRequest' }
 */
router.post('/:id/settle', [body('amount').isFloat({ gt: 0 })], validate, ctrl.settle);

/**
 * @openapi
 * /payments/{id}/void:
 *   post:
 *     tags: [Pagos]
 *     summary: Anular un pago
 *     description: Conserva el registro para auditoria pero lo excluye de los totales.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, example: Cobro duplicado }
 *     responses:
 *       200: { description: Pago anulado }
 */
router.post('/:id/void', authorize('admin'), ctrl.voidPayment);

/**
 * @openapi
 * /payments/{id}/restore:
 *   post:
 *     tags: [Pagos]
 *     summary: Reactivar un pago anulado
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Pago restaurado }
 */
router.post('/:id/restore', authorize('admin'), ctrl.restorePayment);

/**
 * @openapi
 * /payments/{id}:
 *   get:
 *     tags: [Pagos]
 *     summary: Detalle de un pago
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Pago encontrado }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     tags: [Pagos]
 *     summary: Modificar un pago
 *     description: >
 *       Permite corregir monto, descuento, recargo, abonado, fecha, metodo y notas.
 *       El estado se recalcula automaticamente.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Payment' }
 *     responses:
 *       200: { description: Pago actualizado }
 *   delete:
 *     tags: [Pagos]
 *     summary: Eliminar un pago
 *     description: Preferible anularlo para conservar la trazabilidad.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Pago eliminado }
 */
router.route('/:id').get(ctrl.getOne).put(rules, validate, ctrl.update).delete(authorize('admin'), ctrl.remove);

module.exports = router;
