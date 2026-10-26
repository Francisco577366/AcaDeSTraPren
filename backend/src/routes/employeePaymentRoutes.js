const { Router } = require('express');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const ctrl = require('../controllers/employeePaymentController');

const router = Router();
// Router entero reservado al administrador.
// Los sueldos de los companeros no se miran entre companeros.
router.use(authenticate, authorize('admin'));

const rules = [
  body('employeeId').isInt({ min: 1 }).withMessage('Debes indicar el trabajador'),
  body('concept').trim().notEmpty().withMessage('El concepto es obligatorio'),
  body('amount').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('weeks').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('Semanas invalidas'),
  body('weeklyRate').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('Pago semanal invalido'),
  body('hours').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('rate').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('paidAmount').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('periodMonth').optional({ values: 'falsy' }).isInt({ min: 1, max: 12 }),
  body('periodYear').optional({ values: 'falsy' }).isInt({ min: 2000, max: 2100 }),
];

/**
 * @openapi
 * /library/payroll/summary:
 *   get:
 *     tags: [Nomina Libreria]
 *     summary: Resumen de la nomina de libreria
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer, example: 2026 }
 *     responses:
 *       200: { description: Totales por estado, trabajador y mes }
 */
router.get('/summary', ctrl.summary);

/**
 * @openapi
 * /library/payroll/generate-payroll:
 *   post:
 *     tags: [Nomina Libreria]
 *     summary: Generar la nomina de libreria del periodo
 *     description: >
 *       Crea un recibo por cada trabajador activo con las semanas del periodo
 *       por su pago semanal. Omite los que ya tienen recibo para ese periodo.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               month: { type: integer, minimum: 1, maximum: 12 }
 *               year: { type: integer }
 *               weeks:
 *                 type: number
 *                 example: 2
 *                 description: >
 *                   Semanas que cubre el recibo. Por defecto las del periodo;
 *                   el mes de apertura paga solo lo trabajado.
 *     responses:
 *       201: { description: Nomina generada }
 */
router.post('/generate-payroll', ctrl.generatePayroll);

/**
 * @openapi
 * /library/payroll:
 *   get:
 *     tags: [Nomina Libreria]
 *     summary: Listar pagos al personal de libreria
 *     parameters:
 *       - $ref: '#/components/parameters/page'
 *       - $ref: '#/components/parameters/limit'
 *       - $ref: '#/components/parameters/search'
 *       - in: query
 *         name: employeeId
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pendiente, parcial, pagado, anulado] }
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
 *                   items: { $ref: '#/components/schemas/EmployeePayment' }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 *   post:
 *     tags: [Nomina Libreria]
 *     summary: Registrar un pago al personal
 *     description: El monto sale de semanas x pago semanal si no lo escribes a mano.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/EmployeePayment' }
 *     responses:
 *       201: { description: Pago registrado }
 */
router.route('/').get(ctrl.list).post(rules, validate, ctrl.create);

/**
 * @openapi
 * /library/payroll/{id}/settle:
 *   post:
 *     tags: [Nomina Libreria]
 *     summary: Registrar un abono al trabajador
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
 *       200: { description: Abono registrado }
 */
router.post('/:id/settle', [body('amount').isFloat({ gt: 0 })], validate, ctrl.settle);

/**
 * @openapi
 * /library/payroll/{id}/void:
 *   post:
 *     tags: [Nomina Libreria]
 *     summary: Anular un pago al personal
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Pago anulado }
 */
router.post('/:id/void', ctrl.voidPayment);

/**
 * @openapi
 * /library/payroll/{id}:
 *   get:
 *     tags: [Nomina Libreria]
 *     summary: Detalle de un pago al personal
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Pago encontrado }
 *   put:
 *     tags: [Nomina Libreria]
 *     summary: Modificar un pago al personal
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Pago actualizado }
 *   delete:
 *     tags: [Nomina Libreria]
 *     summary: Eliminar un pago al personal
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Pago eliminado }
 */
router.route('/:id').get(ctrl.getOne).put(rules, validate, ctrl.update).delete(ctrl.remove);

module.exports = router;
