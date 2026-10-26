const env = require('../config/env');

/**
 * La fecha de hoy en la zona horaria de la academia, como aaaa-mm-dd.
 *
 * Usar `new Date().toISOString().slice(0, 10)` devuelve la fecha en UTC, y
 * Venezuela va cuatro horas por detras: a partir de las 20:00 locales el UTC
 * ya esta en el dia siguiente. Trabajando de noche eso fechaba los cobros un
 * dia despues (y a fin de mes, en el mes siguiente), que es justo cuando mas
 * se nota. `en-CA` da el formato aaaa-mm-dd directamente.
 */
function todayLocal(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: env.timezone });
}

/** El mes y el anio de hoy en la zona de la academia. */
function currentPeriod(date = new Date()) {
  const [year, month] = todayLocal(date).split('-').map(Number);
  return { year, month };
}

module.exports = { todayLocal, currentPeriod };
