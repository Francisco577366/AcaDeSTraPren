const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/** Corta la peticion si express-validator encontro errores. */
module.exports = function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array().map((e) => ({
    field: e.path || e.param,
    message: e.msg,
  }));

  return next(ApiError.badRequest('Datos invalidos', details));
};
