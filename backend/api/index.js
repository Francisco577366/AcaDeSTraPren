/**
 * Entrada para plataformas serverless (Vercel).
 *
 * Alli no hay un proceso que viva entre peticiones: la plataforma importa
 * este fichero y llama a la aplicacion. Por eso NO se usa src/server.js, que
 * abre un puerto, sincroniza el esquema, garantiza el administrador y arranca
 * el temporizador de las mensualidades. Todo eso se hace una vez a mano
 * (ver el README) y el reloj llega desde fuera, por /api/cron.
 *
 * La revision de configuracion si se hace: es lo unico que impide desplegar
 * con el secreto de ejemplo, y ahi importa mas que en ningun sitio.
 */
require('../src/config/checkEnv').assertProductionConfig();

module.exports = require('../src/app');
