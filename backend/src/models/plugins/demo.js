const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const { esSesionDemo } = require('../../config/contexto');

/**
 * Cuanto puede acumular la cuenta publica en cada coleccion.
 *
 * Las de arriba son las que un visitante crea a mano desde el menu, y van al
 * tope que diga el entorno (diez por defecto).
 *
 * Las de abajo NO: crecen solas al crear las de arriba. Cada alumno genera
 * sus mensualidades y cada venta sus renglones. Si llevaran el mismo tope,
 * dar de alta al sexto alumno fallaria por culpa de los cobros del quinto, y
 * el visitante no tendria forma de entender por que. Quedan acotadas igual,
 * porque sin padre no hay hijo.
 */
const DERIVADAS = {
  payments: 6,
  sale_items: 6,
  teacher_payments: 6,
  employee_payments: 6,
};

const topeDe = (coleccion) =>
  env.demo.maxPorColeccion * (DERIVADAS[coleccion] || 1);

/*
 * Los dos mundos, dichos una vez.
 *
 * `$ne: true` y no `false` a proposito: los registros que ya existian en la
 * base se escribieron antes de que este campo naciera, asi que no lo tienen.
 * Preguntar por `demo: false` los dejaria fuera a todos y la academia
 * aparecria vacia de golpe. "Que no sea true" los incluye.
 */
const SOLO_VISITA = { demo: true };
const SOLO_ACADEMIA = { demo: { $ne: true } };

const filtroActual = () => (esSesionDemo() ? SOLO_VISITA : SOLO_ACADEMIA);

/**
 * Anade el filtro a un $match escrito a mano.
 *
 * Se usa SOLO dentro de los $lookup y $unionWith, que leen otra coleccion
 * desde dentro de una agregacion. Su sub-pipeline no pasa por los hooks del
 * modelo, asi que es el unico sitio donde el filtro hay que escribirlo.
 *
 * Si algun dia anades un cruce de colecciones nuevo, esta funcion es la que
 * tiene que ir dentro. Son seis en todo el backend.
 */
const conFiltro = (match = {}) => ({ ...match, ...filtroActual() });

/**
 * Separa los datos de la cuenta de visita de los de la academia.
 *
 * Cada documento lleva una marca y cada consulta la filtra. Lo importante es
 * que el filtro se pone AQUI y no en los controladores: son cuarenta
 * agregaciones repartidas por nueve ficheros, y escribirlo a mano en todas
 * seria acertar cuarenta veces hoy y otra vez en cada consulta que se escriba
 * manana. Un filtro olvidado no da error: ensena datos reales a quien no debe
 * verlos, y suma registros inventados en los totales de la academia.
 *
 * Lo que este plugin NO alcanza, y hay que mirar a mano:
 *
 *   - Los $lookup y $unionWith, que leen OTRA coleccion desde dentro de una
 *     agregacion. Su sub-pipeline no pasa por aqui. Son seis en todo el
 *     backend y llevan el filtro escrito al lado.
 *   - Las llamadas crudas al driver (connection.collection(...)), que se
 *     saltan los modelos. En codigo de produccion no hay ninguna.
 */
function marcaDemo(schema, { coleccion } = {}) {
  schema.add({
    /**
     * De quien es este registro: de la academia o del cajon de pruebas.
     *
     * Va indexado porque TODAS las consultas lo llevan; sin indice, cada una
     * pasaria a recorrer la coleccion entera.
     */
    demo: { type: Boolean, default: false, index: true },
  });

  /*
   * Al nacer, el registro hereda el mundo de la sesion que lo crea.
   *
   * En `validate` y no en `save` para que el valor este puesto antes de que
   * corran las validaciones y los indices unicos.
   */
  schema.pre('validate', async function marcar(next) {
    if (!this.isNew) return next();

    this.demo = esSesionDemo();
    if (!this.demo) return next();

    /*
     * El tope de la cuenta publica.
     *
     * Se comprueba aqui y no en las rutas porque aqui pasa TODO lo que se
     * crea, venga de donde venga. Una ruta nueva nace con el tope puesto.
     *
     * El conteo ya sale filtrado a lo de la visita: el propio plugin le mete
     * el `demo: true` a esta misma consulta.
     */
    try {
      const tope = topeDe(coleccion);
      const cuantos = await this.constructor.countDocuments({});
      if (cuantos >= tope) {
        return next(
          ApiError.badRequest(
            `La cuenta de demostracion llego a su limite de ${tope} registros aqui. `
            + `Borra alguno para seguir probando; en cualquier caso se vacia sola cada ${env.demo.horasVida} horas.`
          )
        );
      }
    } catch (error) {
      // Si el conteo falla, el tope no es motivo para tumbar la peticion.
      if (error instanceof ApiError) return next(error);
    }

    return next();
  });

  /*
   * Y al consultar, el filtro.
   *
   * La lista de operaciones va explicita y no por expresion regular: una
   * regular que no case con un metodo nuevo de Mongoose lo dejaria pasar sin
   * filtrar, en silencio. Prefiero que anadir una operacion obligue a
   * anadirla aqui.
   */
  const CONSULTAS = [
    'count',
    'countDocuments',
    'find',
    'findOne',
    'findOneAndDelete',
    'findOneAndReplace',
    'findOneAndUpdate',
    'distinct',
    'deleteMany',
    'deleteOne',
    'replaceOne',
    'updateMany',
    'updateOne',
  ];

  CONSULTAS.forEach((operacion) => {
    schema.pre(operacion, { query: true, document: false }, function filtrar(next) {
      this.where(filtroActual());
      next();
    });
  });

  /*
   * Las agregaciones, por delante de todo lo demas.
   *
   * El $match va el PRIMERO del pipeline, no al final: asi la etapa de
   * agrupacion ya no ve los documentos del otro mundo, en vez de sumarlos y
   * descartarlos despues (que ademas daria totales equivocados).
   */
  schema.pre('aggregate', function filtrarAgregacion(next) {
    this.pipeline().unshift({ $match: filtroActual() });
    next();
  });

  /*
   * insertMany no pasa por 'validate', asi que el default del campo es lo
   * unico que marcaria los documentos. Lo usa la carga del seed, que corre
   * fuera de una peticion, pero mas vale que sea explicito.
   */
  schema.pre('insertMany', function marcarLote(next, docs) {
    const marca = esSesionDemo();
    (Array.isArray(docs) ? docs : []).forEach((d) => {
      if (d && typeof d === 'object') d.demo = marca;
    });
    next();
  });
}

module.exports = { marcaDemo, SOLO_VISITA, SOLO_ACADEMIA, filtroActual, conFiltro };
