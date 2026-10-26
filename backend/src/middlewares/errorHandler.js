const ApiError = require('../utils/ApiError');
const env = require('../config/env');

function notFound(req, res, next) {
  next(ApiError.notFound(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

/* eslint-disable no-unused-vars */
function errorHandler(err, req, res, next) {
  let error = err;

  // Errores de Mongo y Mongoose traducidos a mensajes utiles para el usuario.
  if (err.code === 11000 || err.code === 11001) {
    // Clave duplicada: keyPattern dice sobre que campo salto el indice unico.
    const campos = Object.keys(err.keyPattern || err.keyValue || {}).join(', ');
    error = ApiError.conflict(
      `Ya existe un registro con ese valor unico${campos ? ` (${campos})` : ''}`
    );
  } else if (err.name === 'ValidationError') {
    error = ApiError.badRequest(
      'Datos invalidos',
      Object.values(err.errors || {}).map((e) => ({ field: e.path, message: e.message }))
    );
  } else if (err.name === 'CastError') {
    // Un id o un numero que llega con una forma que el campo no admite.
    error = ApiError.badRequest(`El valor de "${err.path}" no es valido`);
  } else if (err.name === 'MongooseServerSelectionError' || err.name === 'MongoNetworkError') {
    // La base no responde. Es un 503 y no un 500: el fallo es de
    // disponibilidad y no de la peticion, y reintentar tiene sentido.
    error = new ApiError(503, 'La base de datos no esta disponible');
  } else if (!(err instanceof ApiError)) {
    error = new ApiError(err.statusCode || 500, err.message || 'Error interno del servidor');
  }

  const esFalloInterno = error.statusCode >= 500;

  if (esFalloInterno) {
    console.error('[error]', err);
  }

  /*
   * Un 500 no cuenta por que fallo.
   *
   * El mensaje de un error no controlado viene de la libreria que lo lanzo, y
   * eso puede ser la consulta SQL entera, el nombre de la tabla o la ruta del
   * fichero. Al usuario no le sirve de nada y a quien este probando la API le
   * sirve de mapa. El detalle queda en el log del servidor, que es su sitio.
   *
   * Los 4xx si llevan su mensaje: son los que explican que corregir.
   */
  const mensaje = esFalloInterno && env.nodeEnv === 'production'
    ? 'Error interno del servidor'
    : error.message;

  res.status(error.statusCode).json({
    success: false,
    message: mensaje,
    details: error.details || undefined,
    stack: env.nodeEnv === 'development' && esFalloInterno ? err.stack : undefined,
  });
}

module.exports = { notFound, errorHandler };
