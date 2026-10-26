class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg = 'Solicitud invalida', details) {
    return new ApiError(400, msg, details);
  }

  static unauthorized(msg = 'No autenticado') {
    return new ApiError(401, msg);
  }

  static forbidden(msg = 'No autorizado') {
    return new ApiError(403, msg);
  }

  static notFound(msg = 'Recurso no encontrado') {
    return new ApiError(404, msg);
  }

  static conflict(msg = 'Conflicto con el estado actual del recurso') {
    return new ApiError(409, msg);
  }
}

module.exports = ApiError;
