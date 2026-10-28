const { Router } = require('express');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const ctrl = require('../controllers/teacherController');

const router = Router();
// los profesores: fuera del alcance de quien solo atiende la libreria.
router.use(authenticate, authorize('admin', 'usuario', 'demo'));

// Solo el nombre es obligatorio; cedula, telefono, correo y direccion no.
const rules = [
  body('firstName').trim().notEmpty().withMessage('El nombre es obligatorio'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Correo invalido'),
  body('studentsCount')
    .optional({ values: 'null' })
    .isInt({ min: 0 })
    .withMessage('Cantidad de alumnos invalida'),
  body('studentRate')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('Tarifa por alumno invalida'),
  body('weeklyHours')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('Horas por semana invalidas'),
  body('hourlyRate').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('Tarifa invalida'),
  body('monthlySalary').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('Salario invalido'),
  body('contractType')
    .optional({ values: 'null' })
    .isIn(['por_alumno', 'fijo', 'por_hora', 'honorarios']),
];

/**
 * @openapi
 * /teachers/options:
 *   get:
 *     tags: [Profesores]
 *     summary: Lista compacta de profesores activos
 *     responses:
 *       200: { description: Profesores con tarifas para autocompletar formularios }
 */
router.get('/options', ctrl.options);

/**
 * @openapi
 * /teachers:
 *   get:
 *     tags: [Profesores]
 *     summary: Listar profesores
 *     parameters:
 *       - $ref: '#/components/parameters/page'
 *       - $ref: '#/components/parameters/limit'
 *       - $ref: '#/components/parameters/search'
 *       - $ref: '#/components/parameters/sort'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [activo, inactivo, suspendido] }
 *       - in: query
 *         name: contractType
 *         schema: { type: string, enum: [fijo, por_hora, honorarios] }
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
 *                   items: { $ref: '#/components/schemas/Teacher' }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 *   post:
 *     tags: [Profesores]
 *     summary: Registrar profesor
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Teacher' }
 *     responses:
 *       201: { description: Profesor creado }
 */
router.route('/').get(ctrl.list).post(rules, validate, ctrl.create);

/**
 * @openapi
 * /teachers/{id}/profile:
 *   get:
 *     tags: [Profesores]
 *     summary: Ficha del profesor con historial de nomina
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Ficha y resumen de pagos }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// La ficha trae el historial de nomina entero: eso es del administrador.
router.get('/:id/profile', authorize('admin'), ctrl.profile);

/**
 * @openapi
 * /teachers/{id}:
 *   get:
 *     tags: [Profesores]
 *     summary: Detalle de un profesor
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Profesor encontrado }
 *   put:
 *     tags: [Profesores]
 *     summary: Actualizar profesor
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Profesor actualizado }
 *   delete:
 *     tags: [Profesores]
 *     summary: Eliminar profesor
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Profesor eliminado }
 */
router.route('/:id').get(ctrl.getOne).put(rules, validate, ctrl.update).delete(authorize('admin'), ctrl.remove);

module.exports = router;
