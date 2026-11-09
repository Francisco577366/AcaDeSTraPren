const crypto = require('crypto');
const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ensureMonthlyCharges, MONTHS } = require('../services/monthlyCharges');
const { limpiarDemo } = require('../services/limpiezaDemo');

const router = Router();

/**
 * Compara dos secretos sin que el tiempo de respuesta delate cuantos
 * caracteres se acertaron. Se comparan los hash y no los textos porque
 * timingSafeEqual exige que los dos buffers midan lo mismo, y la longitud del
 * secreto tampoco hay por que regalarla.
 */
function mismoSecreto(a, b) {
  if (!a || !b) return false;
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Solo pasa quien traiga el secreto del cron.
 *
 * Sin CRON_SECRET configurado el endpoint NO queda abierto: queda cerrado.
 * Un cron sin llave es una ruta publica que escribe en la base, y el fallo
 * silencioso aqui seria peor que no tener la funcion.
 */
function soloCron(req, res, next) {
  if (!env.cronSecret) {
    return next(ApiError.notFound('Ruta no encontrada'));
  }
  const [esquema, valor] = (req.headers.authorization || '').split(' ');
  if (esquema !== 'Bearer' || !mismoSecreto(valor, env.cronSecret)) {
    return next(ApiError.unauthorized('Secreto de cron invalido'));
  }
  return next();
}

// Aunque pida secreto, el endpoint escribe en la base: conviene que nadie
// pueda machacarlo mientras prueba llaves.
const limite = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/**
 * Emite la mensualidad del mes en curso a todos los alumnos activos.
 *
 * En un servidor normal esto lo hace solo el proceso al arrancar y cada pocas
 * horas (ver services/monthlyCharges). En serverless no hay proceso que viva
 * entre peticiones, asi que el reloj tiene que venir de fuera: aqui lo llama
 * el cron de la plataforma una vez al dia.
 *
 * Es la misma funcion y es idempotente, asi que da igual si se llama una vez
 * o veinte: salta a quien ya tenga el cobro del periodo.
 */
router.get(
  '/monthly-charges',
  limite,
  soloCron,
  asyncHandler(async (req, res) => {
    if (!env.autoMonthlyCharges) {
      return res.json({ success: true, message: 'Emision automatica desactivada', data: null });
    }

    const resultado = await ensureMonthlyCharges();
    const etiqueta = `${MONTHS[resultado.period.month - 1]} ${resultado.period.year}`;
    console.log(`[cron] ${etiqueta}: ${resultado.created} emitida(s), ${resultado.skipped} ya estaban`);

    /*
     * De paso, el barrido del cajon de pruebas.
     *
     * Va colgado de esta tarea y no de una suya porque el plan gratuito de
     * Vercel permite muy pocos crons, y porque el riesgo de no barrer es
     * lento: la base se va llenando, no se rompe de golpe. El barrido de
     * verdad, el que importa, ocurre cada vez que entra una visita.
     */
    const limpieza = await limpiarDemo({ silent: false });

    return res.json({
      success: true,
      message: `${etiqueta}: ${resultado.created} mensualidad(es) emitida(s)`,
      data: { ...resultado, demoBarrido: limpieza.total },
    });
  })
);

/**
 * @openapi
 * /cron/limpiar-demo:
 *   get:
 *     tags: [Cron]
 *     summary: Barre lo que la cuenta de demostracion dejo hace mas de N horas
 *     description: >
 *       Solo alcanza registros marcados como de la demostracion: corre dentro
 *       de una sesion de visita y los modelos filtran cada consulta. Los datos
 *       de la academia no se tocan, ni las cuentas.
 */
router.get(
  '/limpiar-demo',
  limite,
  soloCron,
  asyncHandler(async (req, res) => {
    const resultado = await limpiarDemo({ silent: false });
    return res.json({
      success: true,
      message: `${resultado.total} registro(s) de demostracion barrido(s)`,
      data: resultado,
    });
  })
);

module.exports = router;
