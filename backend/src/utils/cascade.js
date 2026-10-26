/**
 * Borrado en cascada.
 *
 * En MySQL lo garantizaba la clave foranea: al borrar un alumno se iban sus
 * cobros, sus trabajos y sus ventas, y lo hacia la base aunque el codigo se
 * olvidara. Mongo no tiene claves foraneas, asi que esto hay que hacerlo a
 * mano, y a mano es justo donde se olvida.
 *
 * Por eso vive en un solo sitio y no repartido por los controladores: si
 * manana aparece una coleccion nueva que cuelga del alumno, se anade aqui una
 * vez y todos los caminos de borrado quedan cubiertos.
 *
 * Las reglas son las mismas que tenia el esquema:
 *   CASCADE  -> el hijo se borra con el padre
 *   SET NULL -> el hijo sobrevive y pierde la referencia
 */
const REGLAS = {
  Student: [
    { modelo: 'Payment', campo: 'studentId', accion: 'borrar' },
    { modelo: 'StudentWork', campo: 'studentId', accion: 'borrar' },
    // La venta sobrevive: fue dinero que entro, y borrarla descuadraria la
    // caja de un mes ya cerrado. Solo deja de estar a nombre de nadie.
    { modelo: 'Sale', campo: 'studentId', accion: 'desvincular' },
  ],
  Teacher: [
    { modelo: 'TeacherPayment', campo: 'teacherId', accion: 'borrar' },
    { modelo: 'StudentWork', campo: 'teacherId', accion: 'desvincular' },
  ],
  Employee: [
    { modelo: 'EmployeePayment', campo: 'employeeId', accion: 'borrar' },
  ],
  Sale: [
    { modelo: 'SaleItem', campo: 'saleId', accion: 'borrar' },
  ],
  Product: [
    // El renglon guarda una copia del nombre y del precio, asi que la venta
    // sigue contando lo que de verdad se cobro aquel dia.
    { modelo: 'SaleItem', campo: 'productId', accion: 'desvincular' },
  ],
  StudentWork: [
    { modelo: 'Payment', campo: 'studentWorkId', accion: 'desvincular' },
  ],
};

/**
 * Aplica las reglas del modelo indicado para un id que se esta borrando.
 *
 * @param {string} modelo  Nombre del modelo padre, p.ej. 'Student'.
 * @param {number} id      Id numerico del registro que se borra.
 * @returns {Promise<object>} Cuantos documentos se tocaron por coleccion.
 */
async function aplicarCascada(modelo, id) {
  const reglas = REGLAS[modelo] || [];
  if (!reglas.length) return {};

  /* eslint-disable global-require */
  const models = require('../models');
  /* eslint-enable global-require */

  const resumen = {};
  for (const regla of reglas) {
    const Modelo = models[regla.modelo];
    if (!Modelo) continue;

    const filtro = { [regla.campo]: id };
    const r = regla.accion === 'borrar'
      ? await Modelo.deleteMany(filtro)
      : await Modelo.updateMany(filtro, { $set: { [regla.campo]: null } });

    const n = r.deletedCount ?? r.modifiedCount ?? 0;
    if (n > 0) resumen[regla.modelo] = n;
  }
  return resumen;
}

module.exports = { aplicarCascada, REGLAS };
