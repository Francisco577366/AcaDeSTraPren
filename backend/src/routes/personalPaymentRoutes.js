const { Router } = require('express');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const ctrl = require('../controllers/personalPaymentController');

const router = Router();
// Router entero reservado al administrador.
// Lo que el dueno retira para su bolsillo no es asunto de quien atiende.
router.use(authenticate, authorize('admin', 'demo'));

const rules = [
  body('concept').trim().notEmpty().withMessage('El concepto es obligatorio'),
  body('amount').isFloat({ gt: 0 }).withMessage('El monto debe ser mayor a cero'),
  body('currency').optional({ values: 'null' }).isIn(['USD', 'VES']).withMessage('Moneda invalida'),
  body('category')
    .optional({ values: 'null' })
    .isIn(['retiro', 'salud', 'hogar', 'transporte', 'otro'])
    .withMessage('Categoria invalida'),
  body('paymentDate').optional({ values: 'falsy' }).isISO8601().withMessage('Fecha invalida'),
];

/**
 * @openapi
 * /personal-payments/summary:
 *   get:
 *     tags: [Pagos Personales]
 *     summary: Cuanto se ha retirado
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer, example: 2026 }
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *     responses:
 *       200: { description: Totales del mes, por mes y por categoria }
 */
router.get('/summary', ctrl.summary);

/**
 * @openapi
 * /personal-payments/previous:
 *   get:
 *     tags: [Pagos Personales]
 *     summary: Los retiros del mes anterior, para proponer su renovacion
 *     description: >
 *       Marca con alreadyRenewed los que ya tienen un gasto del mismo
 *       concepto en el mes destino, para no duplicarlos.
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Listado del mes anterior }
 */
router.get('/previous', ctrl.previous);

/**
 * @openapi
 * /personal-payments/renew:
 *   post:
 *     tags: [Pagos Personales]
 *     summary: Renovar en este mes los retiros elegidos del anterior
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 items: { type: integer }
 *                 description: Cuales del mes anterior se repiten
 *               month: { type: integer, minimum: 1, maximum: 12 }
 *               year: { type: integer }
 *     responses:
 *       201: { description: Renovados }
 */
router.post('/renew', ctrl.renew);

/**
 * @openapi
 * /personal-payments:
 *   get:
 *     tags: [Pagos Personales]
 *     summary: Listar los pagos personales
 *     parameters:
 *       - $ref: '#/components/parameters/page'
 *       - $ref: '#/components/parameters/limit'
 *       - $ref: '#/components/parameters/search'
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [retiro, salud, hogar, transporte, otro] }
 *       - in: query
 *         name: currency
 *         schema: { type: string, enum: [USD, VES] }
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
 *                   items: { $ref: '#/components/schemas/PersonalPayment' }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 *   post:
 *     tags: [Pagos Personales]
 *     summary: Registrar un pago personal
 *     description: >
 *       Dinero que sale de la caja para el bolsillo. No es un gasto del
 *       negocio: no reduce su ganancia, se descuenta de ella como retiro.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PersonalPayment' }
 *     responses:
 *       201: { description: Registrado }
 */
router.route('/').get(ctrl.list).post(rules, validate, ctrl.create);

/**
 * @openapi
 * /personal-payments/{id}:
 *   get:
 *     tags: [Pagos Personales]
 *     summary: Detalle de un pago personal
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Encontrado }
 *   put:
 *     tags: [Pagos Personales]
 *     summary: Modificar un pago personal
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Actualizado }
 *   delete:
 *     tags: [Pagos Personales]
 *     summary: Eliminar un pago personal
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
