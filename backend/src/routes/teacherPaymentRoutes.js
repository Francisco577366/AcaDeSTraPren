const { Router } = require('express');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const ctrl = require('../controllers/teacherPaymentController');

const router = Router();
// Router entero reservado al administrador.
// Los sueldos de los companeros no se miran entre companeros.
router.use(authenticate, authorize('admin'));

const rules = [
  body('teacherId').isInt({ min: 1 }).withMessage('Debes indicar el profesor'),
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
 * /teacher-payments/summary:
 *   get:
 *     tags: [Pagos Profesores]
 *     summary: Resumen de nomina docente
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer, example: 2026 }
 *     responses:
 *       200: { description: Totales por estado, profesor y mes }
 */
router.get('/summary', ctrl.summary);

/**
 * @openapi
 * /teacher-payments/generate-payroll:
 *   post:
 *     tags: [Pagos Profesores]
 *     summary: Generar la nomina del periodo
 *     description: >
 *       Crea un recibo por cada profesor activo con contrato fijo usando su
 *       salario mensual. Omite los que ya tienen recibo para ese periodo.
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
 *                   Semanas que cubre el recibo. Por defecto las del mes
 *                   completo (WEEKS_PER_MONTH); usa menos si el periodo
 *                   arranco a mitad de mes.
 *     responses:
 *       201: { description: Nomina generada }
 */
router.post('/generate-payroll', ctrl.generatePayroll);

/**
 * @openapi
 * /teacher-payments:
 *   get:
 *     tags: [Pagos Profesores]
 *     summary: Listar pagos a profesores
 *     parameters:
 *       - $ref: '#/components/parameters/page'
 *       - $ref: '#/components/parameters/limit'
 *       - $ref: '#/components/parameters/search'
 *       - in: query
 *         name: teacherId
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pendiente, parcial, pagado, anulado] }
 *       - in: query
 *         name: conceptType
 *         schema: { type: string, enum: [salario, honorarios, horas_extra, bono, reembolso, otro] }
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
 *                   items: { $ref: '#/components/schemas/TeacherPayment' }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 *   post:
 *     tags: [Pagos Profesores]
 *     summary: Registrar pago a profesor
 *     description: Si envias horas y tarifa, el monto se calcula automaticamente.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TeacherPayment' }
 *     responses:
 *       201: { description: Pago registrado }
 */
router.route('/').get(ctrl.list).post(rules, validate, ctrl.create);

/**
 * @openapi
 * /teacher-payments/{id}/settle:
 *   post:
 *     tags: [Pagos Profesores]
 *     summary: Registrar un abono al profesor
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
 * /teacher-payments/{id}/void:
 *   post:
 *     tags: [Pagos Profesores]
 *     summary: Anular un pago a profesor
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
 * /teacher-payments/{id}:
 *   get:
 *     tags: [Pagos Profesores]
 *     summary: Detalle de un pago a profesor
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Pago encontrado }
 *   put:
 *     tags: [Pagos Profesores]
 *     summary: Modificar un pago a profesor
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Pago actualizado }
 *   delete:
 *     tags: [Pagos Profesores]
 *     summary: Eliminar un pago a profesor
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
