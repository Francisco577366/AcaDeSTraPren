const { Router } = require('express');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const ctrl = require('../controllers/studentController');

const router = Router();
// los alumnos: fuera del alcance de quien solo atiende la libreria.
router.use(authenticate, authorize('admin', 'usuario', 'demo'));

// Solo el nombre es obligatorio; el resto son datos opcionales del alumno.
const rules = [
  body('firstName').trim().notEmpty().withMessage('El nombre es obligatorio'),
  body('monthlyFee').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('Mensualidad invalida'),
  body('status').optional({ values: 'null' }).isIn(['activo', 'inactivo', 'egresado', 'retirado']),
  body('monthlyCharge')
    .optional({ values: 'null' })
    .isIn(['ninguno', 'pendiente', 'pagado'])
    .withMessage('Estado de la mensualidad invalido'),
  body('enrollmentCharge')
    .optional({ values: 'null' })
    .isIn(['ninguno', 'pendiente', 'pagado'])
    .withMessage('Estado de la inscripcion invalido'),
  body('enrollmentFee').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('Inscripcion invalida'),
];

/**
 * @openapi
 * /students/options:
 *   get:
 *     tags: [Alumnos]
 *     summary: Lista compacta de alumnos activos
 *     responses:
 *       200: { description: Alumnos con id, nombre completo y mensualidad }
 */
router.get('/options', ctrl.options);

/**
 * @openapi
 * /students/debtors:
 *   get:
 *     tags: [Alumnos]
 *     summary: Alumnos con mayor saldo pendiente
 *     description: Ranking de cobranza ordenado por deuda.
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200: { description: Alumnos ordenados por deuda }
 */
router.get('/debtors', ctrl.debtors);

/**
 * @openapi
 * /students:
 *   get:
 *     tags: [Alumnos]
 *     summary: Listar alumnos
 *     description: >
 *       La busqueda cubre nombre, apellido, cedula y grado. Cada fila incluye
 *       ademas balance, overdue y pendingCount con su estado de cobranza.
 *     parameters:
 *       - $ref: '#/components/parameters/page'
 *       - $ref: '#/components/parameters/limit'
 *       - $ref: '#/components/parameters/search'
 *       - $ref: '#/components/parameters/sort'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [activo, inactivo, egresado, retirado] }
 *       - in: query
 *         name: periodMonth
 *         description: Con periodMonth y periodYear el estado es el de ESE mes
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: periodYear
 *         schema: { type: integer }
 *       - in: query
 *         name: paymentState
 *         description: >
 *           Estado de cobranza: al_dia (no debe nada abierto), pendiente
 *           (debe y no ha abonado) o parcial (debe pero ya abono algo).
 *         schema: { type: string, enum: [al_dia, pendiente, parcial, sin_emitir, con_deuda] }
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
 *                   items: { $ref: '#/components/schemas/Student' }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 *   post:
 *     tags: [Alumnos]
 *     summary: Registrar alumno
 *     description: >
 *       Solo el nombre es obligatorio. Al darlo de alta se emiten sus primeros
 *       cobros segun monthlyCharge y enrollmentCharge, porque un alumno recien
 *       registrado normalmente entra debiendo y no al dia.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Student' }
 *     responses:
 *       201: { description: Alumno creado }
 *       400: { $ref: '#/components/responses/BadRequest' }
 */
router.route('/').get(ctrl.list).post(rules, validate, ctrl.create);

/**
 * @openapi
 * /students/{id}/profile:
 *   get:
 *     tags: [Alumnos]
 *     summary: Ficha y estado de cuenta del alumno
 *     description: >
 *       Devuelve el resumen de facturado, abonado, saldo y mora, el historial
 *       completo de cobros y los trabajos con su costo y margen.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Ficha del alumno }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/profile', ctrl.profile);

/**
 * @openapi
 * /students/{id}/settle-debt:
 *   post:
 *     tags: [Alumnos]
 *     summary: Confirmar que el alumno pago lo que debia
 *     description: >
 *       Salda de una vez todos sus cobros abiertos (pendientes, parciales y
 *       vencidos). Para abonos parciales usa POST /payments/{id}/settle.
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
 *               paymentDate: { type: string, format: date }
 *               method: { type: string, enum: [efectivo, transferencia, pago_movil, tarjeta, zelle, otro] }
 *               reference: { type: string }
 *     responses:
 *       200:
 *         description: Cobros saldados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     receipts: { type: integer, example: 3 }
 *                     amount: { type: number, example: 210 }
 *       400: { description: El alumno no tiene cobros pendientes }
 */
router.post(
  '/:id/settle-debt',
  [body('amount').optional({ values: 'falsy' }).isFloat({ gt: 0 }).withMessage('Monto invalido')],
  validate,
  ctrl.settleDebt
);

/**
 * @openapi
 * /students/{id}/payment-status:
 *   post:
 *     tags: [Alumnos]
 *     summary: Marcar cobros como pagados o como pendientes
 *     description: >
 *       Corrige el estado a mano: los ids que van en `paid` quedan saldados y
 *       los que van en `pending` vuelven a cero abonado. Los cobros anulados
 *       se ignoran; para reactivarlos usa POST /payments/{id}/restore.
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
 *             properties:
 *               paid:
 *                 type: array
 *                 items: { type: integer }
 *                 description: Cobros que quedan marcados como pagados
 *               pending:
 *                 type: array
 *                 items: { type: integer }
 *                 description: Cobros que vuelven a quedar pendientes
 *               paymentDate: { type: string, format: date }
 *               method: { type: string, enum: [efectivo, transferencia, pago_movil, tarjeta, zelle, otro] }
 *               reference: { type: string }
 *     responses:
 *       200: { description: Estados actualizados }
 *       400: { $ref: '#/components/responses/BadRequest' }
 */
router.post('/:id/payment-status', ctrl.setPaymentStatus);

/**
 * @openapi
 * /students/{id}/charge:
 *   post:
 *     tags: [Alumnos]
 *     summary: Emitir la mensualidad de un periodo a este alumno
 *     description: >
 *       Crea el cobro del mes para un alumno concreto, sin tener que generar
 *       la tanda completa. Si el monto no se indica, usa su mensualidad.
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
 *               month: { type: integer, minimum: 1, maximum: 12 }
 *               year: { type: integer }
 *               amount: { type: number, description: 'Por defecto, la mensualidad del alumno' }
 *               dueDay: { type: integer, minimum: 1, maximum: 28 }
 *     responses:
 *       201: { description: Mensualidad emitida }
 *       409: { description: Ya existe la mensualidad de ese periodo }
 */
router.post('/:id/charge', ctrl.createCharge);

/**
 * @openapi
 * /students/{id}:
 *   get:
 *     tags: [Alumnos]
 *     summary: Detalle de un alumno
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Alumno encontrado }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     tags: [Alumnos]
 *     summary: Actualizar alumno
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Alumno actualizado }
 *   delete:
 *     tags: [Alumnos]
 *     summary: Eliminar alumno
 *     description: Arrastra sus cobros y trabajos; considera marcarlo inactivo.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Alumno eliminado }
 */
router.route('/:id').get(ctrl.getOne).put(rules, validate, ctrl.update).delete(authorize('admin', 'demo'), ctrl.remove);

module.exports = router;
