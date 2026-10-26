const { Router } = require('express');
const { authenticate } = require('../middlewares/auth');
const ctrl = require('../controllers/dashboardController');

const router = Router();
router.use(authenticate);

/**
 * @openapi
 * /dashboard/overview:
 *   get:
 *     tags: [Dashboard]
 *     summary: Indicadores generales de la academia
 *     description: >
 *       Conteos de representantes, alumnos, profesores y cursos activos,
 *       caja del mes, cuentas por cobrar, mora, nomina pendiente y
 *       rentabilidad acumulada de los trabajos.
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *     responses:
 *       200: { description: Indicadores del panel principal }
 */
router.get('/overview', ctrl.overview);

/**
 * @openapi
 * /dashboard/cashflow:
 *   get:
 *     tags: [Dashboard]
 *     summary: Serie mensual de ingresos contra nomina
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer, example: 2026 }
 *     responses:
 *       200: { description: Doce meses con ingresos, egresos y neto }
 */
router.get('/cashflow', ctrl.cashflow);

module.exports = router;
