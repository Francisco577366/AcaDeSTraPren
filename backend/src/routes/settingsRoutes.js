const { Router } = require('express');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const { getRate } = require('../services/exchangeRate');
const { todayLocal, currentPeriod } = require('../utils/today');
const { authenticate } = require('../middlewares/auth');

const router = Router();

/**
 * @openapi
 * /settings:
 *   get:
 *     tags: [Dashboard]
 *     summary: Parametros de la academia
 *     description: >
 *       Valores de configuracion que la interfaz necesita conocer, como la
 *       moneda y el precio base de la mensualidad. Se definen en el .env.
 *     responses:
 *       200:
 *         description: Configuracion vigente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     currency: { type: string, example: USD }
 *                     baseMonthlyFee: { type: number, example: 70 }
 *                     baseEnrollmentFee: { type: number, example: 0 }
 *                     baseRent: { type: number, example: 0 }
 *                     rentCurrency: { type: string, example: USD }
 *                     baseStudentRate: { type: number, example: 5 }
 *                     weeksPerMonth: { type: number, example: 4 }
 *                     daysPerWeek: { type: number, example: 5 }
 *                     libraryCurrency: { type: string, example: VES }
 *                     academyStartDate: { type: string, example: '2026-09-15' }
 *                     timezone: { type: string, example: America/Caracas }
 *                     today: { type: string, example: '2026-10-01' }
 *                     period: { type: object, example: { year: 2026, month: 10 } }
 */
router.get('/', authenticate, (req, res) => {
  res.json({
    success: true,
    data: {
      currency: env.currency,
      baseMonthlyFee: env.baseMonthlyFee,
      baseEnrollmentFee: env.baseEnrollmentFee,
      baseRent: env.baseRent,
      rentCurrency: env.rentCurrency,
      baseStudentRate: env.baseStudentRate,
      weeksPerMonth: env.weeksPerMonth,
      daysPerWeek: env.daysPerWeek,
      libraryCurrency: env.libraryCurrency,
      academyStartDate: env.academyStartDate,
      timezone: env.timezone,
      // Que dia es hoy SEGUN LA ACADEMIA, no segun el reloj del navegador:
      // asi la interfaz arranca en el mes correcto aunque el equipo este en
      // otra zona horaria.
      today: todayLocal(),
      period: currentPeriod(),
    },
  });
});

/**
 * @openapi
 * /settings/exchange-rate:
 *   get:
 *     tags: [Dashboard]
 *     summary: Tasa oficial del BCV
 *     description: >
 *       Bolivares por dolar segun el Banco Central de Venezuela. Se cachea
 *       unas horas; si la consulta falla se devuelve la ultima conocida con
 *       stale en true.
 *     parameters:
 *       - in: query
 *         name: force
 *         schema: { type: boolean }
 *         description: Salta la cache y vuelve a consultar la fuente
 *     responses:
 *       200:
 *         description: Tasa vigente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     rate: { type: number, nullable: true, example: 832.49 }
 *                     date: { type: string, nullable: true, example: '2026-09-11' }
 *                     source: { type: string }
 *                     stale: { type: boolean, description: No se pudo refrescar }
 */
router.get(
  '/exchange-rate',
  authenticate,
  asyncHandler(async (req, res) => {
    const data = await getRate({ force: String(req.query.force) === 'true' });
    res.json({ success: true, data });
  })
);

module.exports = router;
