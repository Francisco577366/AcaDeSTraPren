const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth');
const ctrl = require('../controllers/activityController');

const router = Router();
router.use(authenticate);

/**
 * @openapi
 * /activity/all:
 *   get:
 *     tags: [Actividad]
 *     summary: Actividad de todas las personas (solo administrador)
 *     description: >
 *       Cuadro comparativo del mes: cuanto registro y cuanto movio cada
 *       persona. Incluye aparte los registros sin autor, que son los
 *       anteriores a guardarse quien los hacia o los que crea un proceso
 *       automatico.
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Actividad de todas las personas }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
// Va antes que la ruta general para que 'all' no se lea como un parametro.
router.get('/all', authorize('admin'), ctrl.everyone);

/**
 * @openapi
 * /activity:
 *   get:
 *     tags: [Actividad]
 *     summary: Actividad administrativa de una persona
 *     description: >
 *       Que registro y cuanto movio en el mes. Sin userId devuelve la propia.
 *       Con userId solo responde al administrador: el resto recibe 403.
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: integer }
 *         description: Solo el administrador puede pedir la de otra persona
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Actividad del periodo }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/', ctrl.mine);

module.exports = router;
