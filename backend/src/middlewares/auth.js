const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { enSesion } = require('../config/contexto');
const { esDemo } = require('../config/roles');
const { User } = require('../models');

/** Convierte los fallos de jsonwebtoken en errores con un mensaje util. */
function traducir(error) {
  if (error.name === 'TokenExpiredError') {
    return ApiError.unauthorized('La sesion expiro, inicia sesion nuevamente');
  }
  if (error.name === 'JsonWebTokenError') {
    return ApiError.unauthorized('Token invalido');
  }
  return error;
}

/** Verifica el Bearer token y adjunta req.user. */
async function authenticate(req, res, next) {
  let payload;

  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Token no proporcionado');
    }

    // Se declara el algoritmo: sin esta lista, el algoritmo con el que se
    // verifica lo elige el propio token que estamos comprobando.
    payload = jwt.verify(token, env.jwt.secret, { algorithms: [env.jwt.algorithm] });
  } catch (error) {
    return next(traducir(error));
  }

  let user;
  try {
    /*
     * El rol se lee de la BASE, no del token.
     *
     * El token lo lleva dentro, pero fiarse de el significaria que un cambio
     * de rol no surte efecto hasta que caduque la sesion, y que un token
     * robado conserva los permisos que tenia. Son dos consultas por peticion
     * a cambio de que degradar una cuenta sea inmediato.
     *
     * Y aqui importa el doble: de este rol sale TAMBIEN a que mundo pertenece
     * la peticion. Si viniera del token, quien se hiciera con uno antiguo
     * seguiria entrando al lado que ya no le toca.
     */
    user = await User.findOne({ id: payload.sub });

    if (!user || !user.active) {
      throw ApiError.unauthorized('Usuario inactivo o inexistente');
    }
    if (user.tokenIsStale(payload.iat)) {
      throw ApiError.unauthorized('La contrasena cambio; inicia sesion nuevamente');
    }
  } catch (error) {
    return next(traducir(error));
  }

  req.user = user;

  /*
   * De aqui en adelante, TODA la peticion sabe de que mundo es: los
   * controladores, las cuarenta agregaciones y los contadores de ids.
   *
   * El contexto envuelve a next() a proposito, que es lo que hace que viaje
   * solo por el resto de la cadena sin pasarlo de mano en mano.
   */
  return enSesion(esDemo(user), () => next());
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
