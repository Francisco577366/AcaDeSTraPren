const { Router } = require('express');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const ctrl = require('../controllers/studentWorkController');

const router = Router();
router.use(authenticate);

const rules = [
  body('studentId').isInt({ min: 1 }).withMessage('Debes indicar el alumno'),
  body('title').trim().notEmpty().withMessage('El titulo del trabajo es obligatorio'),
  body('materialCost').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('Costo de material invalido'),
  body('laborCost').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('Costo de mano de obra invalido'),
  body('price').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('Precio invalido'),
  body('paidAmount').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('Monto abonado invalido'),
  body('grade').optional({ values: 'falsy' }).isFloat({ min: 0, max: 20 }),
  body('status')
    .optional({ values: 'null' })
    .isIn(['pendiente', 'en_proceso', 'entregado', 'aprobado', 'reprobado', 'cancelado']),
];

/**
 * @openapi
 * /works/summary:
 *   get:
 *     tags: [Trabajos]
 *     summary: Indicadores de costo, cobro y margen
 *     description: >
 *       Totaliza costo de materiales y mano de obra frente a lo facturado y
 *       cobrado, y desglosa por estado, estado de pago y categoria.
 *     responses:
 *       200: { description: Indicadores de rentabilidad de los trabajos }
 */
router.get('/summary', ctrl.summary);

/**
 * @openapi
 * /works:
 *   get:
 *     tags: [Trabajos]
 *     summary: Listar trabajos de alumnos
 *     description: >
 *       Cada registro incluye totalCost (materiales + mano de obra),
 *       margin (precio - costo) y balance (precio - abonado).
 *     parameters:
 *       - $ref: '#/components/parameters/page'
 *       - $ref: '#/components/parameters/limit'
 *       - $ref: '#/components/parameters/search'
 *       - $ref: '#/components/parameters/sort'
 *       - in: query
 *         name: studentId
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pendiente, en_proceso, entregado, aprobado, reprobado, cancelado] }
 *       - in: query
 *         name: paymentStatus
 *         schema: { type: string, enum: [sin_costo, pendiente, parcial, pagado] }
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [proyecto, tarea, taller, material, uniforme, evaluacion, otro] }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
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
 *                   items: { $ref: '#/components/schemas/StudentWork' }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 *   post:
 *     tags: [Trabajos]
 *     summary: Registrar trabajo de un alumno
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/StudentWork' }
 *     responses:
 *       201: { description: Trabajo registrado }
 */
router.route('/').get(ctrl.list).post(rules, validate, ctrl.create);

/**
 * @openapi
 * /works/{id}/invoice:
 *   post:
 *     tags: [Trabajos]
 *     summary: Emitir el cobro del trabajo al representante
 *     description: >
 *       Crea un pago de tipo trabajo enlazado a este registro. Falla si el
 *       trabajo no tiene precio o si ya se emitio un cobro.
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
 *               dueDate: { type: string, format: date }
 *               notes: { type: string }
 *     responses:
 *       201: { description: Cobro emitido }
 *       409: { description: El trabajo ya tiene un cobro emitido }
 */
router.post('/:id/invoice', ctrl.invoice);

/**
 * @openapi
 * /works/{id}/settle:
 *   post:
 *     tags: [Trabajos]
 *     summary: Registrar un abono al trabajo
 *     description: Mantiene sincronizado el pago enlazado si existe.
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
 *               amount: { type: number, example: 30 }
 *     responses:
 *       200: { description: Abono registrado }
 */
router.post('/:id/settle', [body('amount').isFloat({ gt: 0 })], validate, ctrl.settle);

/**
 * @openapi
 * /works/{id}:
 *   get:
 *     tags: [Trabajos]
 *     summary: Detalle de un trabajo
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Trabajo encontrado }
 *   put:
 *     tags: [Trabajos]
 *     summary: Actualizar trabajo (costo, precio, estado o nota)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Trabajo actualizado }
 *   delete:
 *     tags: [Trabajos]
 *     summary: Eliminar trabajo
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Trabajo eliminado }
 */
router.route('/:id').get(ctrl.getOne).put(rules, validate, ctrl.update).delete(authorize('admin'), ctrl.remove);

module.exports = router;
