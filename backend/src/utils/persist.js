/**
 * Guarda cambios dejando que corran los hooks del modelo.
 *
 * Con Sequelize habia que declarar a mano los campos derivados, porque el
 * UPDATE solo escribia las columnas que se le pasaban y los valores que
 * calculaban los hooks se perdian en silencio.
 *
 * Mongoose no tiene ese problema SIEMPRE QUE se guarde el documento con
 * save(): ahi corren los hooks de validacion y se escribe todo lo que haya
 * cambiado, incluido lo que calculo el hook. Lo que NO vale es
 * findOneAndUpdate ni updateOne: esos van directos a la base, se saltan los
 * hooks, y un abono dejaria el recibo con el estado viejo.
 *
 * Por eso este helper sigue existiendo aunque ya no tenga que enumerar nada:
 * marca el unico camino correcto para modificar un registro, y deja escrito
 * por que no se usa el atajo.
 */
async function updateRecord(doc, values = {}, options = {}) {
  Object.entries(values).forEach(([clave, valor]) => {
    // undefined significa "no lo toques"; null si es un valor a escribir.
    if (valor !== undefined) doc.set(clave, valor);
  });
  // La sesion viaja aqui cuando el cambio es parte de una transaccion: sin
  // ella, el save escribiria fuera de la transaccion y no se desharia si algo
  // falla despues.
  return doc.save(options.session ? { session: options.session } : undefined);
}

module.exports = { updateRecord };
