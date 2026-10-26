const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const minutos = (n) => n * 60 * 1000;

const respuesta = (mensaje) => (req, res) => {
  res.status(429).json({ success: false, message: mensaje });
};

/**
 * Limite general por IP. Es holgado a proposito: esta para frenar un script,
 * no para estorbar a una secretaria que registra cobros a buen ritmo.
 */
const general = rateLimit({
  windowMs: minutos(env.rateLimit.windowMinutes),
  limit: env.rateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: respuesta('Demasiadas peticiones. Espera un momento y vuelve a intentarlo.'),
});

/**
 * Limite del login, mucho mas estrecho.
 *
 * Sin esto se pueden probar contrasenas de forma ilimitada, que contra un
 * usuario llamado admin@... es cuestion de tiempo. Solo cuentan los intentos
 * fallidos: quien acierta no gasta cupo, asi que entrar y salir varias veces
 * no deja a nadie fuera.
 */
const login = rateLimit({
  windowMs: minutos(env.rateLimit.loginWindowMinutes),
  limit: env.rateLimit.loginMax,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: respuesta(
    'Demasiados intentos fallidos. Espera unos minutos antes de volver a intentarlo.'
  ),
});

module.exports = { general, login };
