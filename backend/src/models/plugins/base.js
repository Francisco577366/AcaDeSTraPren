const mongoose = require('mongoose');
const { autoIncrement } = require('./autoIncrement');

/**
 * Importes de dinero.
 *
 * Se guardan como numero normal, no como Decimal128. Decimal128 es mas exacto
 * sobre el papel, pero en JavaScript obliga a convertir en cada lectura y en
 * cada suma, y basta olvidarlo una vez para tener un bug silencioso en una
 * cifra de dinero. La aplicacion ya redondea a dos decimales en cada frontera
 * con round2(), y las cantidades de una academia (miles de dolares) caben
 * exactas en un double. La exactitud la da el redondeo, no el tipo.
 */
const dinero = (defecto = 0) => ({
  type: Number,
  required: true,
  default: defecto,
  // El redondeo tambien al escribir: asi no entra 69.99999999 a la base.
  // Sin minimo, igual que la columna DECIMAL que habia antes: poner min 0
  // aqui rechazaria un ajuste negativo que hoy la aplicacion permite.
  set: (v) => (v === null || v === undefined ? v : Math.round(Number(v) * 100) / 100),
});

/**
 * Fechas sin hora, como aaaa-mm-dd y en texto.
 *
 * MySQL tenia DATEONLY y aqui se podria usar Date, pero seria un error:
 * un Date se guarda en UTC y Venezuela va cuatro horas por detras, asi que un
 * cobro registrado de noche se guardaria con la fecha del dia siguiente. Ese
 * fallo ya costo un mes de cobros mal fechados.
 *
 * En texto no hay zona horaria que aplicar, y ordenar y comparar aaaa-mm-dd
 * alfabeticamente da el mismo resultado que compararlas como fechas. La
 * aplicacion ya las trataba asi en todas partes.
 */
const fechaSimple = () => ({
  type: String,
  default: null,
  match: [/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser aaaa-mm-dd'],
});

/**
 * Un correlativo visible: el numero de recibo, el codigo de un producto.
 *
 * Es unico, pero puede faltar, y ahi esta el detalle que cuesta caro: un
 * indice `sparse` NO sirve cuando el campo vale null, porque null es un valor
 * y no una ausencia. Dos registros sin codigo chocaban entre si.
 *
 * Por eso la unicidad se declara como indice PARCIAL: solo se exige cuando el
 * campo es texto. Asi puede haber todos los registros sin codigo que haga
 * falta, y dos con el mismo codigo siguen siendo imposibles.
 */
const correlativo = (maxlength = 30) => ({ type: String, maxlength, default: null });

/** El indice que acompana a un campo correlativo. */
const indiceCorrelativo = (campo) => [
  { [campo]: 1 },
  { unique: true, partialFilterExpression: { [campo]: { $type: 'string' } } },
];

/**
 * Crea un esquema con lo que comparten todas las colecciones: id numerico,
 * marcas de tiempo y una salida JSON limpia.
 */
function crearEsquema(campos, { coleccion, indices = [], ...opciones } = {}) {
  const schema = new mongoose.Schema(campos, {
    collection: coleccion,
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      /**
       * Lo que sale por el API usa 'id', no '_id'. El frontend y los datos
       * que ya existen trabajan con el id numerico, asi que el _id de Mongo
       * es un detalle interno que no tiene por que asomar.
       */
      transform: (doc, ret) => {
        delete ret._id;
        return ret;
      },
    },
    ...opciones,
  });

  schema.plugin(autoIncrement, { coleccion });
  // Un indice puede venir solo con sus campos, o con campos y opciones
  // ([campos, opciones]), que es lo que necesitan los indices parciales.
  indices.forEach((indice) => {
    if (Array.isArray(indice)) schema.index(indice[0], indice[1]);
    else schema.index(indice);
  });

  return schema;
}

module.exports = { crearEsquema, dinero, fechaSimple, correlativo, indiceCorrelativo };
