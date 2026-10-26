const mongoose = require('mongoose');

/**
 * Contador por coleccion. Un solo documento por coleccion con el ultimo id
 * entregado.
 */
const Counter = mongoose.model(
  'Counter',
  new mongoose.Schema(
    {
      _id: { type: String, required: true },
      seq: { type: Number, required: true, default: 0 },
    },
    { versionKey: false }
  )
);

/**
 * Ids numericos correlativos, como los de MySQL.
 *
 * Mongo usa ObjectId, que seria lo idiomatico, pero aqui hacen falta numeros:
 *
 *   1. Los numeros de recibo salen del id (REC-000043, NOM-000012, ALQ-...).
 *      Con ObjectId no habria correlativo que mostrar, y el recibo es lo que
 *      el representante tiene en la mano.
 *   2. Hay un mes de datos reales con las relaciones hechas por id.
 *   3. El frontend entero trabaja con ids numericos.
 *
 * findOneAndUpdate con $inc es atomico en Mongo, asi que dos altas a la vez
 * no pueden recibir el mismo numero.
 */
function autoIncrement(schema, { coleccion }) {
  schema.add({ id: { type: Number, unique: true, index: true } });

  schema.pre('validate', async function asignarId(next) {
    if (!this.isNew || this.id != null) return next();
    try {
      const contador = await Counter.findByIdAndUpdate(
        coleccion,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.id = contador.seq;
      return next();
    } catch (error) {
      return next(error);
    }
  });
}

/**
 * Deja el contador por encima del id mas alto que ya exista. Se llama al
 * importar datos: si no, el primer alta despues de una restauracion
 * intentaria reutilizar el id 1 y chocaria con la clave unica.
 */
async function syncCounter(coleccion, ultimoId) {
  if (!ultimoId) return;
  const actual = await Counter.findById(coleccion);
  if (!actual || actual.seq < ultimoId) {
    await Counter.findByIdAndUpdate(coleccion, { seq: ultimoId }, { upsert: true });
  }
}

/** Siguiente id sin consumirlo, para construir correlativos antes de crear. */
async function peekNextId(coleccion) {
  const actual = await Counter.findById(coleccion);
  return (actual ? actual.seq : 0) + 1;
}

module.exports = { autoIncrement, syncCounter, peekNextId, Counter };
