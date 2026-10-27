/**
 * Quita el _id de Mongo de todo lo que sale por el API.
 *
 * Los modelos ya lo hacen al serializarse, pero las consultas con .lean()
 * devuelven objetos planos que se saltan esa transformacion, y las
 * agregaciones nunca pasan por ella. El resultado era que el identificador
 * interno salia en unos endpoints si y en otros no.
 *
 * Esto se hace aqui, envolviendo res.json, y no en cada consulta, por una
 * razon aprendida a golpes: los sueldos de los profesores estuvieron saliendo
 * por el selector porque el recorte se aplico al listado y nadie se acordo del
 * selector. Lo que tiene que valer para TODAS las respuestas se pone donde
 * pasan todas las respuestas.
 *
 * Lo que la aplicacion usa es el id numerico; el _id es un detalle de la base
 * que no tiene por que asomar, ni dar pistas de con que esta hecha.
 */
function quitarIds(valor) {
  if (Array.isArray(valor)) return valor.map(quitarIds);
  if (valor && typeof valor === 'object') {
    // Las fechas y demas objetos con forma propia se dejan como estan.
    if (valor instanceof Date || Buffer.isBuffer(valor)) return valor;

    /*
     * Un documento de Mongoose primero se convierte, y luego se recorre.
     *
     * Object.keys() sobre un documento NO devuelve sus campos sino sus
     * tripas ($__, _doc), asi que recorrerlo directamente lo vacia entero.
     * Eso dejo la pantalla de pagos personales con todas las filas en blanco
     * mientras los totales de arriba, que salen de una agregacion y no de
     * documentos, seguian bien.
     *
     * res.json acaba llamando a toJSON por su cuenta al serializar, pero
     * nosotros llegamos antes: hay que llamarlo aqui.
     */
    if (typeof valor.toJSON === 'function') return quitarIds(valor.toJSON());
    const salida = {};
    Object.keys(valor).forEach((clave) => {
      if (clave === '_id' || clave === '__v') return;
      salida[clave] = quitarIds(valor[clave]);
    });
    return salida;
  }
  return valor;
}

module.exports = function limpiarRespuesta(req, res, next) {
  const original = res.json.bind(res);
  res.json = (cuerpo) => original(quitarIds(cuerpo));
  next();
};
