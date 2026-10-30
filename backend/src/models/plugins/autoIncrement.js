const mongoose = require('mongoose');
const { esSesionDemo } = require('../../config/contexto');

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
 * Donde empiezan los ids de la cuenta de visita.
 *
 * Compartir base obliga a esto. Si el cajon de pruebas gastara el contador de
 * la academia, cada alumno que inventara un visitante dejaria un hueco en la
 * numeracion de los recibos reales: el representante tendria el REC-000066 y
 * el siguiente seria el REC-000070, sin nada en medio que explicarle.
 *
 * Y si las dos numeraciones empezaran en 1 chocarian, porque el id es unico
 * en la coleccion: el alumno 1 del visitante contra el alumno 1 de verdad.
 *
 * Asi que son dos cuentas separadas —cada mundo tiene su documento contador—
 * y la del visitante vive un millon mas arriba. Un recibo suyo se lee
 * REC-1000001 a simple vista, que para una demostracion esta bien: deja claro
 * que no es un recibo de la academia.
 */
const DESPLAZAMIENTO = 1000000;

/** El documento contador que le toca a este mundo. */
const claveDe = (coleccion, demo) => (demo ? `${coleccion}__demo` : coleccion);

/** Del numero del contador al id que se guarda. */
const aId = (seq, demo) => (demo ? DESPLAZAMIENTO + seq : seq);

/** Y al reves, para reponer el contador desde los ids que ya existen. */
const aSeq = (id, demo) => (demo ? id - DESPLAZAMIENTO : id);

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
      /*
       * La marca del propio documento, no la de la sesion. Dan lo mismo en
       * una peticion normal, pero esta no puede equivocarse: el plugin de la
       * marca corre antes que este, asi que a estas alturas el documento ya
       * sabe de que mundo es.
       */
      const demo = this.demo === true;
      const contador = await Counter.findByIdAndUpdate(
        claveDe(coleccion, demo),
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.id = aId(contador.seq, demo);
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
  const demo = esSesionDemo();
  const seq = aSeq(ultimoId, demo);
  if (seq <= 0) return;

  const clave = claveDe(coleccion, demo);
  const actual = await Counter.findById(clave);
  if (!actual || actual.seq < seq) {
    await Counter.findByIdAndUpdate(clave, { seq }, { upsert: true });
  }
}

/** Siguiente id sin consumirlo, para construir correlativos antes de crear. */
async function peekNextId(coleccion) {
  const demo = esSesionDemo();
  const actual = await Counter.findById(claveDe(coleccion, demo));
  return aId((actual ? actual.seq : 0) + 1, demo);
}

module.exports = {
  autoIncrement,
  syncCounter,
  peekNextId,
  Counter,
  claveDe,
  DESPLAZAMIENTO,
};
