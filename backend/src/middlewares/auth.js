const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { User } = require('../models');

/** Verifica el Bearer token y adjunta req.user. */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Token no proporcionado');
    }

    // Se declara el algoritmo: sin esta lista, el algoritmo con el que se
    // verifica lo elige el propio token que estamos comprobando.
    const payload = jwt.verify(token, env.jwt.secret, { algorithms: [env.jwt.algorithm] });
    /*
     * El rol se lee de la BASE, no del token.
     *
     * El token lo lleva dentro, pero fiarse de el significaria que un cambio
     * de rol no surte efecto hasta que caduque la sesion, y que un token
     * robado conserva los permisos que tenia. Son dos consultas por peticion
     * a cambio de que degradar una cuenta sea inmediato.
     */
    const user = await User.findOne({ id: payload.sub });

    if (!user || !user.active) {
      throw ApiError.unauthorized('Usuario inactivo o inexistente');
    }
    if (user.tokenIsStale(payload.iat)) {
      throw ApiError.unauthorized('La contrasena cambio; inicia sesion nuevamente');
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('La sesion expiro, inicia sesion nuevamente'));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(ApiError.unauthorized('Token invalido'));
    }
    return next(error);
  }
}

/** Restringe el acceso a los roles indicados. */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (roles.length && !roles.includes(req.user.role)) {
      return next(ApiError.forbidden('Tu rol no permite esta accion'));
    }
    return next();
  };
}

module.exports = { authenticate, authorize };
