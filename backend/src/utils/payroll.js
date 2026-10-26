const env = require('../config/env');

/**
 * Semanas que le toca cobrar a un profesor en un periodo.
 *
 * Lo normal es el mes completo (WEEKS_PER_MONTH). La excepcion es el mes en
 * que arranco la academia: si empezo a mediados solo se pagan las semanas
 * que quedaron, proporcionales a los dias trabajados y redondeadas a media
 * semana para que el recibo salga con un numero legible.
 *
 * Devuelve 0 para los periodos anteriores al arranque, que no se pagan.
 */
function weeksForPeriod(month, year) {
  const full = Number(env.weeksPerMonth) || 4;
  const start = new Date(`${env.academyStartDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return full;

  const startMonth = start.getUTCMonth() + 1;
  const startYear = start.getUTCFullYear();

  if (year < startYear || (year === startYear && month < startMonth)) return 0;
  if (year > startYear || month > startMonth) return full;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const workedDays = daysInMonth - start.getUTCDate() + 1;
  return Math.max(0, Math.round((workedDays / daysInMonth) * full * 2) / 2);
}

module.exports = { weeksForPeriod };
