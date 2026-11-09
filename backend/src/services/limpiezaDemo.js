/* eslint-disable no-console */
const env = require('../config/env');
const { enSesion } = require('../config/contexto');
const models = require('../models');
const { TABLES } = require('../seed/dataset');

/**
 * Barre lo que la cuenta publica dejo hace mas de unas horas.
 *
 * Por que hace falta: la demostracion comparte base con la academia, y es una
 * cuenta que cualquiera abre desde un enlace y que puede insertar. Sin barrer,
 * lo que dejan veinte visitantes se queda ahi para siempre, ocupando el mismo
 * espacio que los datos del negocio. El plan gratuito de Atlas son 512 MB
 * compartidos: lo que se llena no es la demo, es la base de la academia.
 *
 * Y de paso cada visitante se encuentra la aplicacion limpia, que es como
 * mejor se entiende en dos minutos.
 *
 * Solo puede alcanzar registros marcados: corre dentro de una sesion de
 * visita, y ahi los modelos le meten el `demo: true` a cada consulta. El
 * filtro no lo pone este fichero, y por eso no puede equivocarse.
 *
 * Las CUENTAS no se tocan: borrar la de visita la dejaria sin puerta.
 *
 * @param {number} [horas]  Cuanto se le deja vivir. Por defecto, el entorno.
 */
async function limpiarDemo({ horas = env.demo.horasVida, silent = true } = {}) {
  const corte = new Date(Date.now() - horas * 60 * 60 * 1000);
  const porColeccion = {};
  let total = 0;

  await enSesion(true, async () => {
    // Al reves que las dependencias: primero los hijos, luego los padres.
    for (const t of [...TABLES].reverse()) {
      const { deletedCount } = await models[t].deleteMany({ createdAt: { $lt: corte } });
      if (deletedCount) {
        porColeccion[t] = deletedCount;
        total += deletedCount;
      }
    }
  });

  if (!silent && total) {
    console.log(`[demo] ${total} registro(s) barrido(s), anteriores a ${corte.toISOString()}`);
  }

  return { total, porColeccion, corte, horas };
}

module.exports = { limpiarDemo };
