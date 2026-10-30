const { Router } = require('express');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const ctrl = require('../controllers/employeeController');

const router = Router();
// el personal de la libreria y sus datos: fuera del alcance de quien solo atiende la libreria.
router.use(authenticate, authorize('admin', 'usuario', 'demo'));

const rules = [
  body('firstName').trim().notEmpty().withMessage('El nombre es obligatorio'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Correo invalido'),
  body('payType')
    .optional({ values: 'null' })
    .isIn(['semanal', 'mensual', 'por_hora'])
    .withMessage('Tipo de pago invalido'),
  body('payAmount').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('Monto invalido'),
  body('weeklyHours').optional({ values: 'null' }).isFloat({ min: 0 }),
];

/**
 * @openapi
 * /library/staff/options:
 *   get:
 *     tags: [Personal Libreria]
 *     summary: Lista compacta del personal activo
 *     description: Incluye el pago semanal ya calculado, que es la base de la nomina.
 *     responses:
 *       200: { description: Personal activo }
 */
router.get('/options', ctrl.options);

/**
 * @openapi
 * /library/staff:
 *   get:
 *     tags: [Personal Libreria]
 *     summary: Listar el personal de la libreria
 *     parameters:
 *       - $ref: '#/components/parameters/page'
 *       - $ref: '#/components/parameters/limit'
 *       - $ref: '#/components/parameters/search'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [activo, inactivo, suspendido] }
 *       - in: query
 *         name: payType
 *         schema: { type: string, enum: [semanal, mensual, por_hora] }
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
 *                   items: { $ref: '#/components/schemas/Employee' }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 *   post:
 *     tags: [Personal Libreria]
 *     summary: Registrar un trabajador
 *     description: >
 *       El pago semanal, el mensual y la tarifa por hora se calculan solos a
 *       partir del tipo de pago y el monto acordado.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Employee' }
 *     responses:
 *       201: { description: Trabajador registrado }
 */
router.route('/').get(ctrl.list).post(rules, validate, ctrl.create);

/**
 * @openapi
 * /library/staff/{id}/profile:
 *   get:
 *     tags: [Personal Libreria]
 *     summary: Ficha del trabajador con su historial de nomina
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Ficha encontrada }
 */
// La ficha trae el historial de nomina entero: eso es del administrador.
router.get('/:id/profile', authorize('admin'), ctrl.profile);

/**
 * @openapi
 * /library/staff/{id}:
 *   get:
 *     tags: [Personal Libreria]
 *     summary: Detalle de un trabajador
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Trabajador encontrado }
 *   put:
 *     tags: [Personal Libreria]
 *     summary: Modificar un trabajador
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Trabajador actualizado }
 *   delete:
 *     tags: [Personal Libreria]
 *     summary: Eliminar un trabajador
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Trabajador eliminado }
 */
router.route('/:id').get(ctrl.getOne).put(rules, validate, ctrl.update).delete(authorize('admin', 'demo'), ctrl.remove);

module.exports = router;
